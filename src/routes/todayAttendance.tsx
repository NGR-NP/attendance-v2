/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { Env } from "../types";
import { localDateKey } from "../lib/date";
import {
  listAttendanceForDay,
  listTeacherClasses,
} from "../lib/externalDummy";
import { currentTeacher } from "../lib/auth";
import { Layout } from "../components/Layout";

export const todayAttendanceRoutes = new Hono<{ Bindings: Env }>();

// ── Helpers ──────────────────────────────────────────────────────────

function getDateOffset(date: string, offset: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().split("T")[0];
}

function formatDisplayDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function relativeLabel(date: string, today: string): string | null {
  if (date === today) return "Today";
  if (date === getDateOffset(today, -1)) return "Yesterday";
  if (date === getDateOffset(today, 1)) return "Tomorrow";
  return null;
}

// ── Route handler ─────────────────────────────────────────────────────
//
// Teacher-scoped view of attendance for any selected date.
// Admin uses /admin/attendance/today (admin cookie is path=/admin only).

todayAttendanceRoutes.get("/today", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/login");

  const today = localDateKey();
  const selectedDate = c.req.query("date") || today;
  const selectedClassId = c.req.query("class") || "";
  const isToday = selectedDate === today;
  const prevDate = getDateOffset(selectedDate, -1);
  const nextDate = getDateOffset(selectedDate, 1);
  const displayDate = formatDisplayDate(selectedDate);
  const relLabel = relativeLabel(selectedDate, today);

  const availableClasses = await listTeacherClasses(
    c.env.DB_lunar_attendance,
    teacher.id,
  );

  let records = await listAttendanceForDay(
    c.env.DB_lunar_attendance,
    selectedDate,
    { teacherId: teacher.id },
  );
  if (selectedClassId) {
    records = records.filter((r) => r.classId === selectedClassId);
  }
  const totalCount = records.length;

  function withParams(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const date = overrides.date ?? selectedDate;
    if (date && date !== today) params.set("date", date);
    const cls = overrides.class ?? selectedClassId;
    if (cls) params.set("class", cls);
    const q = params.toString();
    return q ? `/attendance/today?${q}` : "/attendance/today";
  }

  // ── Client scripts ────────────────────────────────────────────────

  const searchScript = `
(function () {
  var input = document.getElementById('attendance-search');
  var countEl = document.getElementById('attendance-count');
  var tbody = document.getElementById('attendance-tbody');
  if (!input || !tbody) return;
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var rows = Array.from(tbody.querySelectorAll('tr[data-search]'));
    var visible = 0;
    rows.forEach(function (row) {
      var match = !q || (row.dataset.search || '').indexOf(q) !== -1;
      row.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (countEl) {
      countEl.textContent = q
        ? visible + ' of ' + rows.length + ' shown'
        : rows.length + ' record' + (rows.length === 1 ? '' : 's');
    }
  });
}());
`;

  const datePickerScript = `
(function () {
  var trigger = document.getElementById('date-trigger');
  var picker = document.getElementById('date-picker');
  if (!trigger || !picker) return;
  trigger.addEventListener('click', function () {
    if (typeof picker.showPicker === 'function') {
      try { picker.showPicker(); return; } catch (e) {}
    }
    picker.focus();
    picker.click();
  });
  picker.addEventListener('change', function () {
    if (!picker.value) return;
    var url = new URL(window.location.href);
    url.searchParams.set('date', picker.value);
    window.location.href = url.toString();
  });
}());
`;

  const classFilterScript = `
(function () {
  var sel = document.getElementById('class-filter');
  if (!sel) return;
  sel.addEventListener('change', function () {
    var url = new URL(window.location.href);
    if (sel.value) url.searchParams.set('class', sel.value);
    else url.searchParams.delete('class');
    window.location.href = url.toString();
  });
}());
`;

  const qrScript = `
(function () {
  var ws = null;
  var qrStarted = false;

  function setStatus(msg, isError) {
    var el = document.getElementById('qr-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  }

  function setLive(on) {
    var dot = document.getElementById('qr-live-dot');
    if (dot) dot.style.display = on ? '' : 'none';
  }

  function renderQrCode(url) {
    var el = document.getElementById('qr-canvas');
    if (!el || typeof QRCode === 'undefined') return;
    el.innerHTML = '';
    new QRCode(el, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H });
    var urlEl = document.getElementById('qr-scan-url');
    if (urlEl) urlEl.textContent = url;
  }

  function addScanLog(studentName, classCode, action) {
    var log = document.getElementById('scan-log');
    if (!log) return;
    var empty = log.querySelector('[data-empty-log]');
    if (empty) empty.remove();
    var item = document.createElement('div');
    item.className = 'scan-log-item';
    var t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    var cls = classCode ? ' (' + classCode + ')' : '';
    item.textContent = t + ' — ' + studentName + cls + ' ' + action;
    log.insertBefore(item, log.firstChild);
    var items = log.querySelectorAll('.scan-log-item');
    if (items.length > 10) items[items.length - 1].remove();
  }

  function prependTableRow(msg) {
    var tbody = document.getElementById('attendance-tbody');
    if (!tbody) return;
    var emptyRow = tbody.querySelector('[data-empty-row]');
    if (emptyRow) emptyRow.remove();
    var t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    var classCode = msg.classCode || '—';
    var className = msg.className || '';
    var studentName = msg.studentName || '—';
    var searchVal = (studentName + ' ' + classCode + ' ' + className).toLowerCase();
    var tr = document.createElement('tr');
    tr.setAttribute('data-search', searchVal);
    tr.innerHTML =
      '<td><span class="time-badge">' + t + '</span></td>' +
      '<td><div class="cell-name">' + studentName + '</div><div class="cell-sub">just now</div></td>' +
      '<td><span class="class-tag">' + classCode + '</span><div class="cell-sub">' + className + '</div></td>' +
      '<td>—</td><td>—</td>' +
      '<td><span class="device-pill">—</span></td><td>—</td>';
    tbody.insertBefore(tr, tbody.firstChild);
    var countEl = document.getElementById('attendance-count');
    var input = document.getElementById('attendance-search');
    if (countEl && input && !input.value) {
      var rows = tbody.querySelectorAll('tr[data-search]');
      countEl.textContent = rows.length + ' record' + (rows.length === 1 ? '' : 's');
    }
  }

  function connectWebSocket(sessionId) {
    if (ws) { try { ws.close(); } catch (e) {} }
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host + '/api/sessions/' + sessionId + '/ws');
    var reconnectDelay = 1500;
    ws.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      if (msg.type === 'connected') {
        renderQrCode(msg.url);
        setStatus('Ready for scans', false);
        setLive(true);
      }
      if (msg.type === 'attended') {
        var action = msg.checkedOut ? 'checked out' : msg.alreadyMarked ? 'already marked' : 'marked present';
        addScanLog(msg.studentName, msg.classCode, action);
        prependTableRow(msg);
        setStatus(msg.studentName + ' ' + action, false);
      }
    };
    ws.onclose = function () {
      setStatus('Reconnecting…', true);
      setLive(false);
      setTimeout(function () {
        reconnectDelay = Math.min(reconnectDelay * 1.5, 20000);
        connectWebSocket(sessionId);
      }, reconnectDelay + Math.random() * 500);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  async function startQrSession() {
    if (qrStarted) return;
    qrStarted = true;
    var startBtn = document.getElementById('qr-start-btn');
    if (startBtn) startBtn.style.display = 'none';
    var panel = document.getElementById('qr-panel');
    if (panel) panel.style.display = '';
    setStatus('Starting session…', false);
    try {
      var res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: '__all__' }),
      });
      var data = await res.json();
      if (!res.ok) {
        qrStarted = false;
        setStatus(data.error || 'Could not start session', true);
        if (startBtn) startBtn.style.display = '';
        if (panel) panel.style.display = 'none';
        return;
      }
      connectWebSocket(data.sessionId);
    } catch (err) {
      qrStarted = false;
      setStatus('Network error — retrying…', true);
      if (startBtn) startBtn.style.display = '';
      if (panel) panel.style.display = 'none';
      setTimeout(startQrSession, 5000);
    }
  }

  function restartQrSession() { qrStarted = false; startQrSession(); }
  var startBtn = document.getElementById('qr-start-btn');
  if (startBtn) startBtn.addEventListener('click', startQrSession);
  var restartBtn = document.getElementById('qr-restart-btn');
  if (restartBtn) restartBtn.addEventListener('click', restartQrSession);
}());
`;

  // ── Render ─────────────────────────────────────────────────────────
  return c.html(
    <Layout
      role="teacher"
      title={`Attendance – ${selectedDate}`}
      teacherActiveTab="today"
      userName={teacher.name}
      qrScript={isToday}
    >
      {/* Page heading */}
      <div class="page-head">
        <div>
          <div class="eyebrow">Attendance</div>
          <h1>Attendance Records</h1>
          <p class="subtitle">
            {isToday
              ? "Start a global QR session — students scan to mark attendance for any of your classes."
              : "Reviewing past attendance records for this date."}
          </p>
        </div>
      </div>

      {/* Date navigation: < June 19, 2026 ▾ > */}
      <div
        style="
          display: flex; align-items: center; justify-content: center; gap: 0.75rem;
          margin-bottom: 1.25rem; padding: 0.6rem 0.9rem;
          background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--rounded-lg); box-shadow: var(--shadow-sm);
          position: relative;
        "
      >
        <a
          href={withParams({ date: prevDate })}
          class="btn-restart"
          aria-label="Previous day"
          style="padding: 0.5rem 0.85rem; font-size: 1rem; line-height: 1;"
        >
          ‹
        </a>
        <button
          id="date-trigger"
          type="button"
          aria-label="Open calendar"
          style="
            display: inline-flex; align-items: center; gap: 0.5rem;
            min-width: 240px; justify-content: center;
            padding: 0.55rem 1.1rem; border-radius: var(--rounded-md);
            background: transparent; border: 1px solid transparent;
            font-family: inherit; font-size: 1rem; font-weight: 800;
            color: var(--ink); cursor: pointer;
            font-variant-numeric: tabular-nums;
          "
        >
          <span>{displayDate}</span>
          {relLabel && (
            <span
              style="
                font-size: 0.72rem; font-weight: 700;
                padding: 0.15rem 0.55rem; border-radius: 99px;
                background: var(--primary-soft); color: var(--primary-hover);
                text-transform: uppercase; letter-spacing: 0.05em;
              "
            >
              {relLabel}
            </span>
          )}
        </button>
        <input
          id="date-picker"
          type="date"
          value={selectedDate}
          max={today}
          style="
            position: absolute; opacity: 0; pointer-events: none;
            inset: 0; width: 1px; height: 1px;
          "
        />
        <a
          href={withParams({ date: nextDate })}
          class="btn-restart"
          aria-label="Next day"
          style="padding: 0.5rem 0.85rem; font-size: 1rem; line-height: 1;"
          aria-disabled={nextDate > today ? "true" : undefined}
        >
          ›
        </a>
      </div>

      {/* Class filter */}
      {availableClasses.length > 1 && (
        <div
          style="
            display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
            margin-bottom: 1.5rem; font-size: 0.85rem; color: var(--muted);
          "
        >
          <label for="class-filter" style="font-weight: 700; color: var(--ink);">
            Class
          </label>
          <select
            id="class-filter"
            style="
              padding: 0.5rem 0.85rem; border: 1px solid var(--line);
              border-radius: var(--rounded-md); background: var(--surface);
              font-family: inherit; font-size: 0.9rem; color: var(--ink);
              min-width: 220px;
            "
          >
            <option value="" selected={!selectedClassId}>All classes</option>
            {availableClasses.map((cls) => (
              <option
                value={cls.id}
                selected={cls.id === selectedClassId}
              >
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>
          {selectedClassId && (
            <a href={withParams({ class: "" })} class="btn-restart">
              Clear filter
            </a>
          )}
        </div>
      )}

      {/* QR session controls (today only) */}
      {isToday && (
        <button
          id="qr-start-btn"
          type="button"
          style="
            display: flex; align-items: center; justify-content: center; gap: 1rem;
            width: 100%; padding: 1.5rem; margin-bottom: 1.5rem;
            background: var(--surface); border: 2px dashed var(--line);
            border-radius: var(--rounded-xl); cursor: pointer;
            font-family: inherit; transition: border-color 0.2s, background 0.2s;
          "
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <div style="text-align: left;">
            <div style="font-weight: 800; font-size: 1rem; color: var(--ink);">
              Start QR Session
            </div>
            <div style="font-size: 0.85rem; color: var(--muted); margin-top: 0.15rem;">
              Generate a live QR code for student check-ins
            </div>
          </div>
        </button>
      )}

      {isToday && (
        <div id="qr-panel" class="live-panel" style="display: none;">
          <div>
            <div class="qr-frame">
              <div id="qr-canvas" />
            </div>
            <p id="qr-scan-url" style="overflow-wrap: anywhere; font-size: 0.72rem; color: var(--muted); margin-top: 0.4rem;" />
          </div>
          <div class="live-info">
            <div class="live-header">
              <div>
                <h2 style="margin: 0;">Global QR Session</h2>
                <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--muted); font-weight: 500;">
                  Students scan to mark attendance for any of your classes today.
                </p>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span id="qr-live-dot" class="live-dot" style="display: none;">
                  LIVE
                </span>
                <button id="qr-restart-btn" class="btn-restart" type="button">
                  ↺ Restart
                </button>
              </div>
            </div>
            <p id="qr-status" style="font-size: 0.9rem; font-weight: 600; color: var(--muted); margin: 0;">
              Starting session…
            </p>
            <div>
              <div style="font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.5rem;">
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

      {/* Search */}
      <div class="search-bar">
        <span class="search-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          id="attendance-search"
          type="search"
          placeholder="Search by student name or class code…"
          autocomplete="off"
        />
        <span id="attendance-count" class="search-count">
          {totalCount} record{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Attendance table */}
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Student</th>
              <th>Class</th>
              <th>Check-out</th>
              <th>Duration</th>
              <th>Device</th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody id="attendance-tbody">
            {records.length === 0 ? (
              <tr data-empty-row="true">
                <td
                  colspan={7}
                  style="text-align: center; padding: 4rem 2rem; color: var(--muted); font-weight: 500;"
                >
                  {isToday
                    ? "No check-ins yet — start a QR session above to begin."
                    : "No attendance recorded for this date."}
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
                      href={`/teacher/class/${r.classId}/attendance`}
                    >
                      {r.classCode}
                    </a>
                    <div class="cell-sub">{r.className}</div>
                  </td>
                  <td>{r.checkoutTime ?? "—"}</td>
                  <td>{r.duration ?? "—"}</td>
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
      <script dangerouslySetInnerHTML={{ __html: datePickerScript }} />
      <script dangerouslySetInnerHTML={{ __html: classFilterScript }} />
      {isToday && (
        <script dangerouslySetInnerHTML={{ __html: qrScript }} />
      )}
    </Layout>,
  );
});
