/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Env } from "../types";
import {
  createStudentAccessGrant,
  createTeacherSession,
  deleteTeacherSession,
  ExternalClass,
  ExternalTeacher,
  findTeacherByCredentials,
  getClassById,
  getClassStudent,
  verifyTeacherSessionPin,
  teacherCanAccessClass,
  listTeacherClasses,
  listClassStudents,
  listClassAttendanceDays,
  listStudentAttendanceSummaries,
  listStudentAttendanceRecords,
  listAttendanceHistory,
  getClassStudent as getClassStudentHelper,
} from "../lib/externalDummy";
import { localDateKey, SQLITE_LOCALTIME_MODIFIER } from "../lib/date";
import { rateLimit, requestIp } from "../lib/rateLimit";
import {
  currentTeacher,
  currentTeacherSession,
  TEACHER_SESSION_COOKIE,
} from "../lib/auth";
import { Layout } from "../components/Layout";

export const teacherRoutes = new Hono<{ Bindings: Env }>();

type AppContext = Context<{ Bindings: Env }>;

function cookieSecure(c: AppContext) {
  return new URL(c.req.url).protocol === "https:";
}

function currentPath(c: AppContext) {
  const url = new URL(c.req.url);
  return `${url.pathname}${url.search}`;
}

function safeNext(next: string | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/teacher/class";
  }
  return next;
}

function boundedFormText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length <= maxLength ? text : "";
}

async function requireRecentTeacherPin(
  c: AppContext,
  teacher: ExternalTeacher,
) {
  const token = currentTeacherSession(c).then((s) => s?.token);
  const realToken = await token;
  const verified = await import("../lib/externalDummy").then((m) =>
    m.isTeacherPinRecentlyVerified(c.env.DB_lunar_attendance, realToken),
  );
  if (verified) return null;

  return c.redirect(
    `/teacher/verify-pin?next=${encodeURIComponent(currentPath(c))}`,
  );
}

function layout(
  title: string,
  teacher: ExternalTeacher | null,
  children: any,
  activeTab?: string,
) {
  return (
    <Layout
      title={title}
      role="teacher"
      userName={teacher?.name}
      teacherActiveTab={activeTab || "classes"}
    >
      {children}
    </Layout>
  );
}


function loginPage(error?: string) {
  return (
    <Layout title="Teacher Login" role="teacher">
      <div class="login-wrap">
        <div class="login">
          <div class="eyebrow">Teacher</div>
          <h1>Open your attendance workspace</h1>
          <p>
            Sign in with the dummy external teacher account to manage classes,
            student access, and live QR attendance.
          </p>
          {error ? <p class="error">{error}</p> : null}
          <form class="form-stack" method="post" action="/teacher/login">
            <label>
              Email
              <input name="email" type="email" value="teacher@example.com" />
            </label>
            <label>
              PIN
              <input name="pin" type="password" value="1234" />
            </label>
            <button type="submit">Sign in</button>
          </form>
        </div>
      </div>
    </Layout>
  );
}

function pinVerifyPage(teacher: ExternalTeacher, next: string, error?: string) {
  return layout(
    "Verify PIN",
    teacher,
    <div class="login-wrap">
      <div class="login">
        <div class="eyebrow">Security check</div>
        <h1>Verify your PIN</h1>
        <p>
          Sensitive attendance actions require a fresh PIN check on this device.
        </p>
        {error ? <p class="error">{error}</p> : null}
        <form class="form-stack" method="post" action="/teacher/verify-pin">
          <input type="hidden" name="next" value={next} />
          <label>
            PIN
            <input name="pin" type="password" autocomplete="current-password" />
          </label>
          <button type="submit">Verify PIN</button>
        </form>
      </div>
    </div>,
    "classes"
  );
}

async function loadOwnedClass(c: AppContext, teacher: ExternalTeacher) {
  const classId = c.req.param("classId") || c.req.param("classid");
  if (!classId) return null;
  const allowed = await teacherCanAccessClass(
    c.env.DB_lunar_attendance,
    teacher.id,
    classId,
  );
  if (!allowed) return null;

  return getClassById(c.env.DB_lunar_attendance, classId);
}

teacherRoutes.get("/dashboard", (c) => c.redirect("/teacher/class"));
teacherRoutes.get("/enroll", (c) => c.redirect("/teacher/class"));

teacherRoutes.get("/verify-pin", async (c) => {
  const session = await currentTeacherSession(c);
  if (!session) return c.redirect("/teacher/class");

  return c.html(
    pinVerifyPage(session.teacher, safeNext(c.req.query("next")), undefined),
  );
});

teacherRoutes.post("/verify-pin", async (c) => {
  const session = await currentTeacherSession(c);
  if (!session) return c.redirect("/teacher/class");

  const body = await c.req.parseBody();
  const next = safeNext(String(body.next ?? "/teacher/class"));

  const valid = await verifyTeacherSessionPin(
    c.env.DB_lunar_attendance,
    session.token,
    String(body.pin ?? ""),
  );

  if (!valid) {
    return c.html(pinVerifyPage(session.teacher, next, "Incorrect PIN"), 403);
  }

  return c.redirect(next);
});

teacherRoutes.get("/login", async (c) => {
  const teacher = await currentTeacher(c);
  if (teacher) return c.redirect("/teacher/class");
  return c.html(loginPage());
});

teacherRoutes.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = boundedFormText(body.email, 120);
  const pin = boundedFormText(body.pin, 20);

  if (!email || !pin) {
    return c.html(loginPage("Email and PIN are required"), 400);
  }

  const teacher = await findTeacherByCredentials(
    c.env.DB_lunar_attendance,
    email,
    pin,
  );

  if (!teacher) {
    return c.html(loginPage("Invalid teacher email or PIN"), 401);
  }

  const session = await createTeacherSession(
    c.env.DB_lunar_attendance,
    teacher.id,
  );
  setCookie(c, TEACHER_SESSION_COOKIE, session.token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 14,
    path: "/",
    sameSite: "Lax",
    secure: cookieSecure(c),
  });

  return c.redirect("/teacher/class");
});

teacherRoutes.post("/logout", async (c) => {
  const token = getCookie(c, TEACHER_SESSION_COOKIE);
  if (token) await deleteTeacherSession(c.env.DB_lunar_attendance, token);
  deleteCookie(c, TEACHER_SESSION_COOKIE, { path: "/" });
  return c.redirect("/teacher/class");
});

teacherRoutes.get("/class", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.html(loginPage());

  const classCards = await listTeacherClasses(
    c.env.DB_lunar_attendance,
    teacher.id,
  );

  if (teacher.role === "attendance_display") {
    if (classCards.length === 1) {
      return c.redirect(`/teacher/class/${classCards[0].id}/attendance/start`);
    }
    return c.html(
      layout(
        "Display Mode",
        teacher,
        <>
          <div class="page-head">
            <div class="page-copy">
              <h1>Select Class</h1>
              <p>Choose a class to start displaying the attendance QR code.</p>
            </div>
          </div>
          <div class="grid">
            {classCards.map((classItem) => (
              <article class="card class-card">
                <div class="class-top">
                  <div>
                    <span class="class-code">{classItem.code}</span>
                    <p>{classItem.name}</p>
                  </div>
                </div>
                <div class="actions">
                  <a
                    class="button"
                    href={`/teacher/class/${classItem.id}/attendance/start`}
                  >
                    Display QR
                  </a>
                </div>
              </article>
            ))}
          </div>
        </>,
      ),
    );
  }

  const totalStudents = classCards.reduce(
    (total, classItem) => total + classItem.studentCount,
    0,
  );
  return c.html(
    layout(
      "Teacher Classes",
      teacher,
      <>
        <section class="hero-panel">
          <div class="page-copy">
            <div class="eyebrow">Teacher workspace</div>
            <h1>Welcome back, {teacher.name}</h1>
            <p>
              Choose a class to run attendance, review daily totals, or prepare
              student access. Class rosters are synced from the external dummy
              database for this prototype.
            </p>
            <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
              <a class="button" href="/teacher/attendance/main">
                Start Main QR Session
              </a>
              <a class="button secondary" href="/attendance/today">
                Today's Attendance
              </a>
            </div>
          </div>
          <div class="summary-grid">
            <div class="stat-card">
              <div class="stat-value">{classCards.length}</div>
              <div class="stat-label">Assigned classes</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{totalStudents}</div>
              <div class="stat-label">Roster seats</div>
            </div>
          </div>
        </section>
        <div class="section-head">
          <div>
            <h2>Classes</h2>
            <p>Start with the class you are teaching today.</p>
          </div>
        </div>
        <div class="grid">
          {classCards.length ? (
            classCards.map((classItem) => (
              <article class="card class-card">
                <div class="class-top">
                  <div>
                    <span class="class-code">{classItem.code}</span>
                    <p>{classItem.name}</p>
                  </div>
                  <div class="class-meta">
                    <span class="pill">{classItem.studentCount} students</span>
                  </div>
                </div>
                <div class="actions">
                  <a
                    class="button"
                    href={`/teacher/class/${classItem.id}/attendance`}
                  >
                    Attendance
                  </a>
                  <a
                    class="button secondary"
                    href={`/teacher/class/${classItem.id}/student`}
                  >
                    Students
                  </a>
                </div>
              </article>
            ))
          ) : (
            <div class="card empty-state">
              <h2>No assigned classes</h2>
              <p>
                This teacher account does not have any classes in the external
                dummy database yet.
              </p>
            </div>
          )}
        </div>
      </>,
    ),
  );
});

teacherRoutes.get("/class/:classId/student", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const classItem = await loadOwnedClass(c, teacher);
  if (!classItem) return c.text("Class not found", 404);

  const students = await listClassStudents(
    c.env.DB_lunar_attendance,
    classItem.id,
  );
  return c.html(
    layout(
      `${classItem.code} Students`,
      teacher,
      <>
        <div class="page-head">
          <div class="page-copy">
            <div class="eyebrow">{classItem.code}</div>
            <h1>
              {classItem.name} <span class={"muted"}>roster</span>
            </h1>
            <p>
              Manage the students who can claim access for this class and review
              individual attendance from one place.
            </p>
          </div>
          <div class="actions">
            <a
              class="button secondary"
              href={`/teacher/class/${classItem.id}/attendance`}
            >
              Attendance overview
            </a>
          </div>
        </div>
        <div class="grid" style="margin-bottom: 18px;">
          <div class="card">
            <div class="muted">Roster</div>
            <div class="metric">{students.length}</div>
            <p class="small">
              Students currently enrolled in {classItem.code}.
            </p>
          </div>
          <div class="card">
            <div class="muted">Access setup</div>
            <div class="metric-line">One QR per student</div>
            <p class="small">
              Access QRs can be claimed once and then used across enrolled
              classes.
            </p>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Email</th>
              <th>Access</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {students.length ? (
              students.map((student) => (
                <tr>
                  <td>
                    <div class="cell-title">{student.name}</div>
                    <div class="cell-subtitle">Student ID {student.id}</div>
                  </td>
                  <td>{student.email}</td>
                  <td>
                    <a
                      class="button secondary"
                      href={`/teacher/class/${classItem.id}/student/${student.id}/access`}
                    >
                      Access QR
                    </a>
                  </td>
                  <td>
                    <a
                      class="button secondary"
                      href={`/teacher/class/${classItem.id}/student/${student.id}/attendance`}
                    >
                      View history
                    </a>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colspan={4}>
                  <div class="empty-state">
                    <h2>No students in this class yet</h2>
                    <p>
                      Add students in the external dummy database, then refresh
                      this page to prepare access QRs.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </>,
    ),
  );
});

teacherRoutes.get("/class/:classId/attendance", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const classItem = await loadOwnedClass(c, teacher);
  if (!classItem) return c.text("Class not found", 404);

  const rosterSizeRow = await c.env.DB_lunar_attendance.prepare(
    `SELECT COUNT(*) AS total
         FROM student_classes
        WHERE class_id = ?`,
  )
    .bind(classItem.id)
    .first<{ total: number }>();
  const rosterSize = rosterSizeRow?.total ?? 0;

  const attendanceDays = await listClassAttendanceDays(
    c.env.DB_lunar_attendance,
    classItem.id,
  );

  const today = localDateKey();
  const todayRow = attendanceDays.find((row) => row.day === today);
  const todayPresent = todayRow?.total ?? 0;
  const todaySessionsRow = await c.env.DB_lunar_attendance.prepare(
    `SELECT COUNT(*) AS total
       FROM sessions
      WHERE class_id = ?
        AND date(created_at, 'unixepoch', ${SQLITE_LOCALTIME_MODIFIER}) = ?`,
  )
    .bind(classItem.id, today)
    .first<{ total: number }>();
  const todaySessions = todaySessionsRow?.total ?? 0;

  return c.html(
    layout(
      `${classItem.code} Attendance`,
      teacher,
      <>
        <div class="page-head">
          <div class="page-copy">
            <div class="eyebrow">{classItem.code}</div>
            <h1>
              {classItem.name} <span class={"muted"}>attendance</span>
            </h1>
            <p>
              Track daily attendance progress and reopen today's live QR session
              when class is in progress.
            </p>
          </div>
          <div class="actions">
            <a
              class="button"
              href={`/teacher/class/${classItem.id}/attendance/start`}
            >
              {todaySessions
                ? "Open today's attendance"
                : "Start today's attendance"}
            </a>
            <a
              class="button secondary"
              href={`/teacher/class/${classItem.id}/student`}
            >
              Students
            </a>
          </div>
        </div>
        <div class="grid" style="margin-bottom: 18px;">
          <div class="card">
            <div class="muted">Today</div>
            <div class="metric">
              {todayPresent} / {rosterSize}
            </div>
            <p class="small">Students marked present for {today}.</p>
          </div>
          <div class="card">
            <div class="muted">Roster size</div>
            <div class="metric">{rosterSize}</div>
            <p class="small">Students currently enrolled in this class.</p>
          </div>
          <div class="card">
            <div class="muted">Today's sessions</div>
            <div class="metric">{todaySessions}</div>
            <p class="small">Live QR sessions opened today.</p>
          </div>
        </div>
        <div class="section-head">
          <div>
            <h2>Daily history</h2>
            <p>Each row groups attendance by local date.</p>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Present</th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {attendanceDays.length ? (
              attendanceDays.map((row) => (
                <tr>
                  <td>{row.day}</td>
                  <td>
                    <div class="cell-title">
                      {row.total} of {rosterSize}
                    </div>
                    <div class="cell-subtitle">Students present</div>
                  </td>
                  <td>{row.sessions}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colspan={3}>
                  <div class="empty-state">
                    <h2>No attendance recorded yet</h2>
                    <p>
                      Start today's attendance to create the first live QR
                      session for this class.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </>,
    ),
  );
});

function renderLiveAttendancePage(
  c: AppContext,
  teacher: ExternalTeacher,
  classItem: { id: string; code: string; name: string },
) {
  const isDisplayRole = teacher.role === "attendance_display";

  return c.html(
    <Layout
      title={`${classItem.code} Attendance`}
      role="teacher"
      userName={teacher.name}
      teacherActiveTab={classItem.id === "__all__" ? "global-qr" : "classes"}
      qrScript={true}
      backHref={
        !isDisplayRole
          ? classItem.id === "__all__"
            ? "/teacher/class"
            : `/teacher/class/${classItem.id}/attendance`
          : undefined
      }
      backLabel={!isDisplayRole ? "Back to stats" : undefined}
    >
      <div class="page-head">
        <div class="page-copy">
          <div class="eyebrow">{classItem.code}</div>
          <h1>Live attendance</h1>
          <p>
            Keep this screen visible during class. The QR is static, but
            each successful scan appears in the log automatically.
          </p>
        </div>
        <button id="restartBtn" class="secondary" type="button">
          Restart Session
        </button>
      </div>
      <div class="live-grid">
        <section>
          <div class="section-head" style="margin-top: 0;">
            <div>
              <h2>Student scan code</h2>
              <p>Students scan this code from their registered device.</p>
            </div>
          </div>
          <div id="qr-wrap">
            <div id="qr"></div>
          </div>
          <p id="scan-url" class="qr-caption"></p>
        </section>
        <section>
          <div class="card">
            <div class="muted">Session</div>
            <div id="sessionId" class="metric">
              Starting
            </div>
            <p id="status">Waiting for QR connection</p>
          </div>
          <div style="height: 14px;"></div>
          <div class="card">
            <h2>Recent scans</h2>
            <p class="small">
              Successful scans appear here as students mark attendance.
            </p>
            <div id="log" class="log-list">
              <p data-empty-log="true">No scans yet.</p>
            </div>
          </div>
        </section>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
        const classId = ${JSON.stringify(classItem.id)}
        let ws = null
        let statusTimer = null

        async function startSession() {
          document.getElementById('sessionId').textContent = 'Starting'
          const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId })
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Could not start attendance')
          document.getElementById('sessionId').textContent = data.sessionId.slice(0, 8)
          connectWs(data.sessionId)
        }

        function connectWs(sessionId) {
          if (ws) ws.close()
          const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
          ws = new WebSocket(protocol + '//' + location.host + '/api/sessions/' + sessionId + '/ws')
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            if (msg.type === 'connected') {
              renderQr(msg.url)
              document.getElementById('status').textContent = 'Listening for scans...'
              document.getElementById('status').style.color = 'var(--success)'
            }
            if (msg.type === 'attended') {
              showAttended(msg.studentName, msg.alreadyMarked, msg.checkedOut, msg.className, msg.classCode)
              appendLog(msg.studentName, msg.alreadyMarked, msg.checkedOut, msg.className, msg.classCode)
            }
          }
          let reconnectDelay = 1000;
          ws.onclose = () => {
            setTimeout(() => { connectWs(sessionId); reconnectDelay = Math.min(reconnectDelay * 2, 30000); },
                       reconnectDelay + Math.random() * 1000);
          };
        }

        function renderQr(url) {
          const el = document.getElementById('qr')
          el.innerHTML = ''
          new QRCode(el, { text: url, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.H })
          document.getElementById('scan-url').textContent = url
        }

        function showAttended(name, alreadyMarked, checkedOut, className, classCode) {
          const status = document.getElementById('status')
          const classInfo = classCode ? ' (' + classCode + ')' : ''
          if (checkedOut) {
            status.textContent = name + classInfo + ' checked out'
          } else {
            status.textContent = alreadyMarked ? name + classInfo + ' was already present' : name + classInfo + ' marked present'
          }
          clearTimeout(statusTimer)
          statusTimer = setTimeout(() => {
            status.textContent = 'Listening for scans...'
          }, 3500)
        }

        function appendLog(name, alreadyMarked, checkedOut, className, classCode) {
          const row = document.createElement('p')
          let actionText = ' - ';
          if (checkedOut) actionText = ' checked out - ';
          else if (alreadyMarked) actionText = ' already present - ';

          const classInfo = classCode ? ' (' + classCode + ') ' : ''
          row.textContent = name + classInfo + actionText + new Date().toLocaleTimeString()
          const log = document.getElementById('log')
          const empty = log.querySelector('[data-empty-log]')
          if (empty) empty.remove()
          log.prepend(row)
        }

        document.getElementById('restartBtn').addEventListener('click', () => startSession().catch(showError))

        function showError(error) {
          document.getElementById('status').textContent = error.message
          document.getElementById('status').style.color = 'var(--danger)'
        }

        startSession().catch(showError)
      `,
        }}
      />
    </Layout>
  );
}


teacherRoutes.get("/attendance/main", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const pinResponse = await requireRecentTeacherPin(c, teacher);
  if (pinResponse) return pinResponse;

  const classItem = {
    id: "__all__",
    code: "Main QR",
    name: "All Classes",
  };

  return renderLiveAttendancePage(c, teacher, classItem);
});

teacherRoutes.get("/class/:classId/attendance/start", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const classItem = await loadOwnedClass(c, teacher);
  if (!classItem) return c.text("Class not found", 404);
  const pinResponse = await requireRecentTeacherPin(c, teacher);
  if (pinResponse) return pinResponse;

  return renderLiveAttendancePage(c, teacher, classItem);
});

teacherRoutes.get("/class/:classId/student/attendance", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const classItem = await loadOwnedClass(c, teacher);
  if (!classItem) return c.text("Class not found", 404);
  const pinResponse = await requireRecentTeacherPin(c, teacher);
  if (pinResponse) return pinResponse;

  const students = await listClassStudents(
    c.env.DB_lunar_attendance,
    classItem.id,
  );
  const rows = await listStudentAttendanceSummaries(
    c.env.DB_lunar_attendance,
    classItem.id,
  );
  const byStudent = new Map(rows.map((row) => [row.studentId, row]));
  const presentStudents = students.filter((student) =>
    byStudent.has(student.id),
  ).length;

  return c.html(
    layout(
      `${classItem.code} Student Attendance`,
      teacher,
      <>
        <div class="page-head">
          <div class="page-copy">
            <div class="eyebrow">{classItem.code}</div>
            <h1>Student attendance</h1>
            <p>
              Compare each student's attendance history for this class and open
              their individual record when you need more detail.
            </p>
          </div>
          <div class="actions">
            <a
              class="button secondary"
              href={`/teacher/class/${classItem.id}/attendance`}
            >
              Overview
            </a>
          </div>
        </div>
        <div class="grid" style="margin-bottom: 18px;">
          <div class="card">
            <div class="muted">Roster</div>
            <div class="metric">{students.length}</div>
            <p class="small">Students enrolled in {classItem.code}.</p>
          </div>
          <div class="card">
            <div class="muted">With attendance</div>
            <div class="metric">{presentStudents}</div>
            <p class="small">Students with at least one recorded day.</p>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Days present</th>
              <th>Latest</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const row = byStudent.get(student.id);
              return (
                <tr>
                  <td>
                    <div class="cell-title">{student.name}</div>
                    <div class="cell-subtitle">{student.email}</div>
                  </td>
                  <td>
                    <div class="cell-title">{row?.daysPresent ?? 0}</div>
                    <div class="cell-subtitle">Recorded days</div>
                  </td>
                  <td>
                    {row?.latestAt
                      ? new Date(row.latestAt * 1000).toLocaleString()
                      : "Never"}
                  </td>
                  <td>
                    <a
                      class="button secondary"
                      href={`/teacher/class/${classItem.id}/student/${student.id}/attendance`}
                    >
                      View
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>,
    ),
  );
});

teacherRoutes.get(
  "/class/:classId/student/:studentId/attendance",
  async (c) => {
    const teacher = await currentTeacher(c);
    if (!teacher) return c.redirect("/teacher/class");

    const classItem = await loadOwnedClass(c, teacher);
    if (!classItem) return c.text("Class not found", 404);
    const pinResponse = await requireRecentTeacherPin(c, teacher);
    if (pinResponse) return pinResponse;

    const studentId = c.req.param("studentId");
    const student = await getClassStudent(
      c.env.DB_lunar_attendance,
      classItem.id,
      studentId,
    );
    if (!student) return c.text("Student not found", 404);

    const rows = await listStudentAttendanceRecords(
      c.env.DB_lunar_attendance,
      classItem.id,
      student.id,
    );
    const latestRecord = rows[0];

    return c.html(
      layout(
        `${student.name} Attendance`,
        teacher,
        <>
          <div class="page-head">
            <div class="page-copy">
              <div class="eyebrow">{classItem.code}</div>
              <h1>{student.name}</h1>
              <p>
                Individual attendance record for {classItem.name}. Use this when
                a teacher needs to verify a student's scan history.
              </p>
            </div>
            <a
              class="button secondary"
              href={`/teacher/class/${classItem.id}/student`}
            >
              Students
            </a>
          </div>
          <div class="grid" style="margin-bottom: 18px;">
            <div class="card">
              <div class="muted">Student email</div>
              <div class="metric-line">{student.email}</div>
            </div>
            <div class="card">
              <div class="muted">Attendance records</div>
              <div class="metric">{rows.length}</div>
              <p class="small">
                {latestRecord
                  ? `Latest scan on ${latestRecord.day} at ${latestRecord.time}`
                  : "No scans recorded yet."}
              </p>
            </div>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Duration</th>
                <th>Session</th>
                <th>Device</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr>
                    <td>{row.day}</td>
                    <td>{row.time}</td>
                    <td>{row.checkoutTime ?? "—"}</td>
                    <td>{row.duration ?? "—"}</td>
                    <td>{row.sessionId.slice(0, 8)}</td>
                    <td>
                      <div class="cell-title">
                        {row.deviceType ?? "Unknown"}
                      </div>
                      <div class="cell-subtitle">
                        {row.clientPlatform ??
                          row.clientTimezone ??
                          "No client details"}
                      </div>
                    </td>
                    <td>
                      <div class="cell-title">
                        {row.requesterIp ?? "Unknown"}
                      </div>
                      <div class="cell-subtitle">
                        {row.country ?? "No country"}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colspan={7}>No attendance recorded for this student.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>,
      ),
    );
  },
);

teacherRoutes.get("/class/:classId/student/:studentId/access", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const classItem = await loadOwnedClass(c, teacher);
  if (!classItem) return c.text("Class not found", 404);
  const pinResponse = await requireRecentTeacherPin(c, teacher);
  if (pinResponse) return pinResponse;

  const studentId = c.req.param("studentId");
  const student = await getClassStudent(
    c.env.DB_lunar_attendance,
    classItem.id,
    studentId,
  );
  if (!student) return c.text("Student not found", 404);

  const tokenPayload = await import("../lib/token").then((m) =>
    m.createToken(
      {
        type: "returning_student",
        studentId: student.id,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      },
      c.env.ADMIN_SECRET,
    ),
  );
  const accessUrl = `${new URL(c.req.url).origin}/register?token=${encodeURIComponent(tokenPayload)}`;

  return c.html(
    <Layout
      title={`${student.name} Access`}
      role="teacher"
      userName={teacher.name}
      teacherActiveTab="classes"
      qrScript={true}
      backHref={`/teacher/class/${classItem.id}/student`}
      backLabel="Students"
    >
      <div class="page-head">
        <div class="page-copy">
          <div class="eyebrow">{classItem.code}</div>
          <h1>Give {student.name} attendance access</h1>
          <p>
            This one-time QR links the student's browser to their external
            student record. After it is claimed, the saved access token
            works until the course end date, expires after 7 idle days,
            and rotates after each attendance scan.
          </p>
        </div>
      </div>
      <div class="live-grid">
        <section>
          <div class="section-head" style="margin-top: 0;">
            <div>
              <h2>One-time access QR</h2>
              <p>
                Ask the student to scan this once on their own device.
              </p>
            </div>
          </div>
          <div id="qr-wrap">
            <div id="qr"></div>
          </div>
          <p id="scan-url">{accessUrl}</p>
        </section>
        <section class="card">
          <div class="muted">Student</div>
          <h2>{student.name}</h2>
          <p>{student.email}</p>
          <ul class="support-list">
            <li>QR expires in 24 hours.</li>
            <li>QR can only be used once to set up your session.</li>
            <li>
              Access works across all classes where this student is
              enrolled.
            </li>
          </ul>
          <div class="actions" style="margin-top: 16px;">
            <a
              class="button secondary"
              href={`/teacher/class/${classItem.id}/student/${student.id}/access`}
            >
              Create new QR
            </a>
          </div>
        </section>
      </div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" />

      <script
        dangerouslySetInnerHTML={{
          __html: `
        new QRCode(document.getElementById('qr'), {
          text: ${JSON.stringify(accessUrl)},
          width: 280,
          height: 280,
          correctLevel: QRCode.CorrectLevel.H
        })
      `,
        }}
      />
    </Layout>,
  );
});
// Redirects for backward compatibility (misspelled 'attendance' paths)
teacherRoutes.get("/class/:classId/attendance", (c) => {
  return c.redirect(`/teacher/class/${c.req.param("classId")}/attendance`);
});
teacherRoutes.get("/class/:classId/attendance/start", (c) => {
  return c.redirect(
    `/teacher/class/${c.req.param("classId")}/attendance/start`,
  );
});
teacherRoutes.get("/class/:classId/student/attendance", (c) => {
  return c.redirect(
    `/teacher/class/${c.req.param("classId")}/student/attendance`,
  );
});
teacherRoutes.get("/class/:classId/student/:studentId/attendance", (c) => {
  return c.redirect(
    `/teacher/class/${c.req.param("classId")}/student/${c.req.param("studentId")}/attendance`,
  );
});

// ── Attendance History (teacher-scoped, filterable, paginated) ─────────
teacherRoutes.get("/attendance/history", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/login");

  const today = localDateKey();
  const dt = new Date(`${today}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - 29);
  const defaultFrom = dt.toISOString().split("T")[0];

  const from = c.req.query("from") || defaultFrom;
  const to = c.req.query("to") || today;
  const classId = c.req.query("class") || "";
  const q = c.req.query("q") || "";
  const sortRaw = c.req.query("sort") || "day";
  const dirRaw = c.req.query("dir") || "desc";
  const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const sort: "day" | "student" | "class" =
    sortRaw === "student" || sortRaw === "class" ? sortRaw : "day";
  const dir: "asc" | "desc" = dirRaw === "asc" ? "asc" : "desc";

  const [teacherClasses, { records, total }] = await Promise.all([
    listTeacherClasses(c.env.DB_lunar_attendance, teacher.id),
    listAttendanceHistory(c.env.DB_lunar_attendance, {
      teacherId: teacher.id,
      from,
      to,
      classId: classId || undefined,
      q: q || undefined,
      sort,
      dir,
      limit: pageSize,
      offset,
    }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const startRow = total === 0 ? 0 : offset + 1;
  const endRow = Math.min(offset + records.length, total);

  function withParams(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string> = {
      from,
      to,
      class: classId,
      q,
      sort,
      dir,
      page: String(page),
    };
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) continue;
      merged[k] = v;
    }
    if (merged.from && merged.from !== defaultFrom) params.set("from", merged.from);
    if (merged.to && merged.to !== today) params.set("to", merged.to);
    if (merged.class) params.set("class", merged.class);
    if (merged.q) params.set("q", merged.q);
    if (merged.sort && merged.sort !== "day") params.set("sort", merged.sort);
    if (merged.dir && merged.dir !== "desc") params.set("dir", merged.dir);
    if (merged.page && merged.page !== "1") params.set("page", merged.page);
    const s = params.toString();
    return s ? `/teacher/attendance/history?${s}` : "/teacher/attendance/history";
  }

  function sortLink(col: "day" | "student" | "class", label: string) {
    const active = sort === col;
    const nextDir: "asc" | "desc" = active && dir === "desc" ? "asc" : "desc";
    const arrow = active ? (dir === "desc" ? " ↓" : " ↑") : "";
    return (
      <a
        href={withParams({ sort: col, dir: nextDir, page: "1" })}
        style={`color: inherit; text-decoration: none; ${active ? "color: var(--primary);" : ""}`}
      >
        {label}
        {arrow}
      </a>
    );
  }

  return c.html(
    <Layout
      role="teacher"
      title="Attendance History"
      teacherActiveTab="history"
      userName={teacher.name}
    >
      <div style="margin-bottom: 1.5rem;">
        <div class="eyebrow">Records</div>
        <h1 style="margin: 0 0 0.4rem;">Attendance History</h1>
        <p class="subtitle">
          Search across your assigned classes and date ranges. Defaults to the last 30 days.
        </p>
      </div>

      {/* ── Filters ── */}
      <form
        method="get"
        action="/teacher/attendance/history"
        style="
          display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) auto;
          gap: 0.75rem; align-items: end;
          padding: 1rem 1.25rem; margin-bottom: 1.5rem;
          background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--rounded-lg); box-shadow: var(--shadow-sm);
        "
      >
        <div>
          <label
            for="history-from"
            style="display: block; font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;"
          >
            From
          </label>
          <input
            id="history-from"
            type="date"
            name="from"
            value={from}
            max={to}
            style="
              width: 100%; padding: 0.55rem 0.75rem;
              border: 1px solid var(--line); border-radius: var(--rounded-md);
              font-family: inherit; font-size: 0.9rem; background: var(--bg); color: var(--ink);
            "
          />
        </div>
        <div>
          <label
            for="history-to"
            style="display: block; font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;"
          >
            To
          </label>
          <input
            id="history-to"
            type="date"
            name="to"
            value={to}
            min={from}
            max={today}
            style="
              width: 100%; padding: 0.55rem 0.75rem;
              border: 1px solid var(--line); border-radius: var(--rounded-md);
              font-family: inherit; font-size: 0.9rem; background: var(--bg); color: var(--ink);
            "
          />
        </div>
        <div>
          <label
            for="history-class"
            style="display: block; font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;"
          >
            Class
          </label>
          <select
            id="history-class"
            name="class"
            style="
              width: 100%; padding: 0.55rem 0.75rem;
              border: 1px solid var(--line); border-radius: var(--rounded-md);
              font-family: inherit; font-size: 0.9rem; background: var(--bg); color: var(--ink);
            "
          >
            <option value="" selected={!classId}>All my classes</option>
            {teacherClasses.map((cls) => (
              <option value={cls.id} selected={cls.id === classId}>
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            for="history-q"
            style="display: block; font-size: 0.72rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;"
          >
            Student
          </label>
          <input
            id="history-q"
            type="search"
            name="q"
            value={q}
            placeholder="Name or ID"
            autocomplete="off"
            style="
              width: 100%; padding: 0.55rem 0.75rem;
              border: 1px solid var(--line); border-radius: var(--rounded-md);
              font-family: inherit; font-size: 0.9rem; background: var(--bg); color: var(--ink);
            "
          />
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="submit" class="button">Apply</button>
          <a href="/teacher/attendance/history" class="button secondary">Reset</a>
        </div>
      </form>

      {/* ── Summary ── */}
      <div
        style="
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--muted);
        "
      >
        <div>
          {total === 0
            ? "No records match these filters."
            : `Showing ${startRow}–${endRow} of ${total} records`}
        </div>
      </div>

      {/* ── Table ── */}
      {records.length === 0 ? (
        <div class="empty-state">
          <p>No attendance records found for the selected filters.</p>
        </div>
      ) : (
        <div class="table-container">
          <table>
            <thead style="position: sticky; top: 0; background: var(--surface); z-index: 1;">
              <tr>
                <th>{sortLink("day", "Date")}</th>
                <th>Time</th>
                <th>{sortLink("student", "Student")}</th>
                <th>{sortLink("class", "Class")}</th>
                <th>Check-out</th>
                <th>Duration</th>
                <th>Device</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr>
                  <td style="font-variant-numeric: tabular-nums;">{r.day}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div
          style="
            display: flex; align-items: center; justify-content: center; gap: 0.5rem;
            margin-top: 1.5rem;
          "
        >
          <a
            href={withParams({ page: String(Math.max(page - 1, 1)) })}
            class="button secondary"
            aria-disabled={page === 1 ? "true" : undefined}
            style={page === 1 ? "pointer-events: none; opacity: 0.5;" : ""}
          >
            ← Previous
          </a>
          <span style="font-size: 0.85rem; color: var(--muted); padding: 0 0.75rem;">
            Page {page} of {totalPages}
          </span>
          <a
            href={withParams({ page: String(Math.min(page + 1, totalPages)) })}
            class="button secondary"
            aria-disabled={page === totalPages ? "true" : undefined}
            style={page === totalPages ? "pointer-events: none; opacity: 0.5;" : ""}
          >
            Next →
          </a>
        </div>
      )}
    </Layout>,
  );
});
