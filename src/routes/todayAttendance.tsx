/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { Env } from "../types";
import { localDateKey } from "../lib/date";
import { listAttendanceForDay } from "../lib/externalDummy";
import { currentAdmin, currentTeacher } from "../lib/auth";
import { Layout } from "../components/Layout";

export const todayAttendanceRoutes = new Hono<{ Bindings: Env }>();

type C = Context<{ Bindings: Env }>;

// ── Route handler ─────────────────────────────────────────────────────

todayAttendanceRoutes.get("/today", async (c) => {
  // ── 1. Determine viewer role ────────────────────────────────────────
  let role: "admin" | "teacher" | null = null;
  let teacherId: string | undefined;
  let viewerName = "";

  const isAdmin = await currentAdmin(c);
  if (isAdmin) {
    role = "admin";
    viewerName = "Admin";
  } else {
    const teacher = await currentTeacher(c);
    if (teacher) {
      role = "teacher";
      teacherId = teacher.id;
      viewerName = teacher.name;
    }
  }

  if (!role) return c.redirect("/teacher/class");

  // ── 2. Load today's records ────────────────────────────────────────
  const today = localDateKey();
  const records = await listAttendanceForDay(
    c.env.DB_lunar_attendance,
    today,
    role === "teacher" ? { teacherId } : undefined,
  );

  const uniqueStudents = new Set(records.map((r) => r.studentId)).size;
  const uniqueClasses = new Set(records.map((r) => r.classId)).size;
  const totalCount = records.length;

  // ── 3. Build client scripts ────────────────────────────────────────

  // Search script — re-counts from live tbody so dynamically added rows work
  const searchScript = `
(function () {
  var input = document.getElementById('search-input');
  var countEl = document.getElementById('search-count');
  if (!input) return;
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var tbody = document.getElementById('today-tbody');
    if (!tbody) return;
    var rows = Array.from(tbody.querySelectorAll('tr[data-search]'));
    var visible = 0;
    rows.forEach(function (row) {
      var match = !q || (row.dataset.search || '').includes(q);
      row.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (countEl) countEl.textContent = q
      ? visible + ' of ' + rows.length + ' records'
      : rows.length + ' record' + (rows.length === 1 ? '' : 's');
  });
}());
`;

  // Teacher QR + WebSocket + live table update script
  // NOTE: startSession() is NOT called on load — the teacher must click "Start QR Session"
  const teacherQrScript = `
(function () {
  var ws = null;
  var started = false;

  function setStatus(msg, cls) {
    var el = document.getElementById('qr-status');
    if (!el) return;
    el.textContent = msg;
    el.className = cls || '';
  }

  function renderQr(url) {
    var el = document.getElementById('today-qr');
    if (!el) return;
    el.innerHTML = '';
    new QRCode(el, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
    var scanUrl = document.getElementById('qr-scan-url');
    if (scanUrl) scanUrl.textContent = url;
  }

  function appendLog(name, classCode, checkedOut, alreadyMarked) {
    var log = document.getElementById('scan-log');
    if (!log) return;
    var empty = log.querySelector('[data-empty-log]');
    if (empty) empty.remove();
    var item = document.createElement('div');
    item.className = 'scan-log-item';
    var action = checkedOut ? ' checked out' : alreadyMarked ? ' already present' : ' marked present';
    var cls = classCode ? ' (' + classCode + ')' : '';
    item.textContent = name + cls + action + ' · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    log.insertBefore(item, log.firstChild);
    // cap at 8 items
    var items = log.querySelectorAll('.scan-log-item');
    if (items.length > 8) items[items.length - 1].remove();
  }

  function prependTableRow(msg) {
    var tbody = document.getElementById('today-tbody');
    if (!tbody) return;
    // remove empty-state row if present
    var emptyRow = tbody.querySelector('[data-empty-row]');
    if (emptyRow) emptyRow.remove();

    var time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    var classCode = msg.classCode || '—';
    var className = msg.className || '';
    var searchVal = ((msg.studentName || '') + ' ' + classCode + ' ' + className).toLowerCase();

    var tr = document.createElement('tr');
    tr.setAttribute('data-search', searchVal);
    tr.className = 'new-row-flash';
    tr.innerHTML =
      '<td><span class="time-badge">' + time + '</span></td>' +
      '<td><div class="cell-name">' + (msg.studentName || '—') + '</div><div class="cell-sub">just now · live</div></td>' +
      '<td><span class="class-tag">' + classCode + '</span><div class="cell-sub">' + className + '</div></td>' +
      '<td><span class="device-pill">—</span></td>' +
      '<td>—</td>';
    tbody.insertBefore(tr, tbody.firstChild);

    // Update stat counter
    var statEl = document.getElementById('stat-total');
    if (statEl) statEl.textContent = String(parseInt(statEl.textContent || '0', 10) + 1);

    // Update search count
    var countEl = document.getElementById('search-count');
    if (countEl && !document.getElementById('search-input').value) {
      var rows = tbody.querySelectorAll('tr[data-search]');
      countEl.textContent = rows.length + ' record' + (rows.length === 1 ? '' : 's');
    }
  }

  function connectWs(sessionId) {
    if (ws) { try { ws.close(); } catch(e) {} }
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host + '/api/sessions/' + sessionId + '/ws');
    var reconnectDelay = 1500;
    ws.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      if (msg.type === 'connected') {
        renderQr(msg.url);
        setStatus('Ready — students can scan to mark attendance', 'ok');
        var dot = document.getElementById('live-dot');
        if (dot) dot.style.display = '';
      }
      if (msg.type === 'attended') {
        appendLog(msg.studentName, msg.classCode, msg.checkedOut, msg.alreadyMarked);
        prependTableRow(msg);
        setStatus((msg.checkedOut ? msg.studentName + ' checked out' : msg.studentName + ' marked present') + (msg.classCode ? ' (' + msg.classCode + ')' : ''), 'ok');
      }
    };
    ws.onclose = function () {
      setStatus('Reconnecting…');
      var dot = document.getElementById('live-dot');
      if (dot) dot.style.display = 'none';
      setTimeout(function () {
        reconnectDelay = Math.min(reconnectDelay * 1.5, 20000);
        connectWs(sessionId);
      }, reconnectDelay + Math.random() * 500);
    };
    ws.onerror = function () { ws.close(); };
  }

  async function startSession() {
    started = true;
    // Hide start button, show QR panel
    var startBtn = document.getElementById('qr-start-btn');
    if (startBtn) startBtn.style.display = 'none';
    var livePanel = document.getElementById('live-panel');
    if (livePanel) livePanel.style.display = '';

    setStatus('Starting global QR session…');
    try {
      var res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: '__all__' })
      });
      var data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setStatus('PIN verification required — ', 'err');
          var pinLink = document.createElement('a');
          pinLink.href = '/teacher/attendance/main';
          pinLink.textContent = 'go to Main QR to verify PIN';
          pinLink.style.cssText = 'color: var(--primary); font-weight: 700;';
          var statusEl = document.getElementById('qr-status');
          if (statusEl) statusEl.appendChild(pinLink);
        } else {
          setStatus((data && data.error) || 'Could not start session', 'err');
        }
        return;
      }
      connectWs(data.sessionId);
    } catch (err) {
      setStatus('Network error — retrying in 5s…', 'err');
      setTimeout(startSession, 5000);
    }
  }

  // Start button click
  var startBtn = document.getElementById('qr-start-btn');
  if (startBtn) startBtn.addEventListener('click', function () { startSession(); });

  // Restart button click (within the live panel)
  var restartBtn = document.getElementById('qr-restart-btn');
  if (restartBtn) restartBtn.addEventListener('click', function () { startSession(); });
}());
`;

  // ── 4. Render ──────────────────────────────────────────────────────
  return c.html(
    <Layout
      role={role}
      title={`Today's Attendance – ${today}`}
      adminActiveTab={role === "admin" ? "today" : undefined}
      teacherActiveTab={role === "teacher" ? "today" : undefined}
      userName={viewerName}
      qrScript={role === "teacher"}
    >
      {/* ── Page heading ── */}
      <div class="page-head">
        <div>
          <div class="eyebrow">Live feed</div>
          <h1>Today's Attendance</h1>
          <p class="subtitle">
            {role === "teacher"
              ? "Click Start to activate a Global QR session — students scan to mark attendance for your classes."
              : "All check-ins recorded today across every class."}
          </p>
        </div>
        <span class="date-badge">{today}</span>
      </div>

      {/* ── TEACHER: Start button (shown before session starts) ── */}
      {role === "teacher" && (
        <div
          id="qr-start-btn"
          style="
            display: flex; align-items: center; justify-content: center; gap: 1rem;
            padding: 2rem; margin-bottom: 2rem;
            background: var(--surface); border: 2px dashed var(--line);
            border-radius: var(--rounded-xl); cursor: pointer;
            transition: all 0.2s ease;
          "
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <div>
            <div style="font-weight: 800; font-size: 1rem; color: var(--ink);">Start QR Session</div>
            <div style="font-size: 0.85rem; color: var(--muted); margin-top: 0.25rem;">
              Click to generate a live QR code for student check-ins
            </div>
          </div>
        </div>
      )}

      {/* ── TEACHER: Live QR panel (hidden until session starts) ── */}
      {role === "teacher" && (
        <div id="live-panel" class="live-panel" style="display: none;">
          {/* Left: QR code */}
          <div>
            <div class="qr-frame">
              <div id="today-qr" />
            </div>
            <p id="qr-scan-url" style="overflow-wrap: anywhere; font-size: 0.75rem; color: var(--muted); margin-top: 0.25rem;" />
          </div>

          {/* Right: status + log */}
          <div class="live-info">
            <div class="live-header">
              <div>
                <h2>Global QR Session</h2>
                <p
                  style="margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--muted); font-weight: 500;"
                >
                  Students scan this code to mark attendance for any of
                  your classes today.
                </p>
              </div>
              <div class="gap-2">
                <span
                  id="live-dot"
                  class="live-dot"
                  style="display: none;"
                >
                  LIVE
                </span>
                <button
                  id="qr-restart-btn"
                  class="btn-restart"
                  type="button"
                >
                  ↺ Restart
                </button>
              </div>
            </div>

            <p id="qr-status" style="font-size: 0.9rem; font-weight: 600; color: var(--muted);">
              Starting session…
            </p>

            <div>
              <div
                style="font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.5rem;"
              >
                Recent scans
              </div>
              <div id="scan-log" class="scan-log">
                <div class="scan-log-empty" data-empty-log="true">
                  No scans yet — waiting for students…
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN: info notice ── */}
      {role === "admin" && (
        <div
          style="
            display: flex; align-items: center; gap: 1rem;
            padding: 1rem 1.5rem; margin-bottom: 2rem;
            background: var(--primary-soft); border: 1px solid #fde68a;
            border-radius: var(--rounded-lg); font-size: 0.875rem;
            font-weight: 600; color: var(--primary-hover);
          "
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          QR sessions are started by teachers. This view shows all check-ins for today across every class.
        </div>
      )}

      {/* ── Stats ── */}
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">Total Check-ins</div>
          <div class="stat-value" id="stat-total">{totalCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Unique Students</div>
          <div class="stat-value">{uniqueStudents}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Classes</div>
          <div class="stat-value">{uniqueClasses}</div>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div class="search-bar">
        <span class="search-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          id="search-input"
          type="search"
          placeholder="Search by student name or class code…"
          autocomplete="off"
        />
        <span id="search-count" class="search-count">
          {totalCount} record{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* ── Attendance table (always rendered — teacher's JS prepends rows live) ── */}
      <div class="table-container">
        <table id="attendance-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Student</th>
              <th>Class</th>
              <th>Device</th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody id="today-tbody">
            {records.length === 0 ? (
              <tr data-empty-row="true">
                <td
                  colspan={5}
                  style="text-align: center; padding: 4rem 2rem; color: var(--muted); font-weight: 500;"
                >
                  {role === "teacher"
                    ? "No check-ins yet — start a QR session above to begin."
                    : "No attendance recorded yet today."}
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr
                  data-search={`${r.studentName} ${r.classCode} ${r.className}`.toLowerCase()}
                >
                  <td>
                    <span class="time-badge">{r.time}</span>
                  </td>
                  <td>
                    <div class="cell-name">{r.studentName}</div>
                    <div class="cell-sub">{r.studentId}</div>
                  </td>
                  <td>
                    <a
                      class="class-tag"
                      href={
                        role === "admin"
                          ? `/admin/classes/${r.classId}`
                          : `/teacher/class/${r.classId}/attendance`
                      }
                    >
                      {r.classCode}
                    </a>
                    <div class="cell-sub">{r.className}</div>
                  </td>
                  <td>
                    <span class="device-pill">{r.deviceType ?? "unknown"}</span>
                  </td>
                  <td>{r.country ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <script dangerouslySetInnerHTML={{ __html: searchScript }} />
      {role === "teacher" && (
        <script dangerouslySetInnerHTML={{ __html: teacherQrScript }} />
      )}
    </Layout>,
  );
});
