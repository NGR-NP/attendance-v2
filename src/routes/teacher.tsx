/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Env } from "../types";
import {
  createStudentAccessGrant,
  createTeacherSession,
  countClassStudents,
  deleteTeacherSession,
  ExternalClass,
  ExternalTeacher,
  findTeacherByCredentials,
  getClassById,
  getClassStudent,
  getTeacherBySessionToken,
  isTeacherPinRecentlyVerified,
  listClassAttendanceDays,
  listClassStudents,
  listStudentAttendanceRecords,
  listStudentAttendanceSummaries,
  listTeacherClasses,
  TEACHER_SESSION_COOKIE,
  teacherCanAccessClass,
  verifyTeacherSessionPin,
} from "../lib/externalDummy";
import { localDateKey, SQLITE_LOCALTIME_MODIFIER } from "../lib/date";
import { rateLimit, requestIp } from "../lib/rateLimit";

export const teacherRoutes = new Hono<{ Bindings: Env }>();

type AppContext = Context<{ Bindings: Env }>;

const styles = `
  @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap");

  :root {
    color-scheme: light;
    --font-sans: "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --primary: lab(34.5327% 41.302 -79.0771);
    --primary-soft: color-mix(in srgb, var(--primary), white 90%);
    --primary-tint: color-mix(in srgb, var(--primary), white 76%);
    --ink: #0f172a;
    --muted: #64748b;
    --line: rgba(148, 163, 184, 0.28);
    --surface: rgba(255, 255, 255, 0.86);
    --surface-solid: #ffffff;
    --success: #15803d;
    --danger: #b91c1c;
    --shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
    --shadow-strong: 0 22px 60px rgba(15, 23, 42, 0.12);
    --rounded-xs: 0.6rem;
    --rounded-sm: 1rem;
    --rounded-md: 1.4rem;
    --rounded-lg: 2rem;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: var(--font-sans);
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background:
      radial-gradient(circle at 12% -12%, color-mix(in srgb, var(--primary), white 84%) 0, rgba(255, 255, 255, 0) 34rem),
      linear-gradient(140deg, #fbfcff 0%, #f7f8ff 44%, #f8fafc 100%);
    color: var(--ink);
  }
  a { color: inherit; text-decoration: none; }
  .shell { min-height: 100vh; }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(255, 255, 255, 0.78);
    border-bottom: 1px solid var(--line);
    backdrop-filter: blur(18px);
  }
  .topbar-inner { max-width: 1120px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .brand { color: var(--primary); font-size: 18px; font-weight: 900; letter-spacing: 0; }
  .nav { display: flex; align-items: center; gap: 10px; color: #475569; font-size: 14px; font-weight: 600; }
  .main { max-width: 1120px; margin: 0 auto; padding: 34px 24px 58px; }
  .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 24px; }
  .page-copy { max-width: 650px; }
  .eyebrow { color: var(--primary); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 7px; }
  h1 { margin: 0; font-size: 34px; line-height: 1.12; letter-spacing: 0; font-weight: 900; }
  h2 { margin: 0; font-size: 20px; letter-spacing: 0; font-weight: 800; }
  p { color: #475569; line-height: 1.62; margin: 8px 0 0; font-weight: 500; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
  .hero-panel {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.8fr);
    gap: 22px;
    align-items: center;
    margin-bottom: 22px;
    padding: 20px 40px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72)),
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--primary), white 84%), transparent 24rem);
    border: 1px solid rgba(255, 255, 255, 0.82);
    border-radius: var(--rounded-lg);
    box-shadow: var(--shadow);
    outline: 1px solid var(--line);
  }
  .hero-panel h1 { max-width: 720px; }
  .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .stat-card {
    min-height: 108px;
    padding: 16px 20px;
    background: rgba(255, 255, 255, 0.74);
    border: 1px solid var(--line);
    border-radius: var(--rounded-sm);
  }
  .stat-value { color: var(--primary); font-size: 48px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
  .stat-label { margin-top: 8px; color: #475569; font-size: 13px; font-weight: 800; }
  .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 26px 0 14px; }
  .section-head h2 { font-size: 22px; }
  .card {
    background: var(--surface);
    border: 1px solid rgba(255, 255, 255, 0.78);
    border-radius: var(--rounded-lg);
    padding: 24px 28px;
    box-shadow: var(--shadow);
    outline: 1px solid var(--line);
  }
  .class-card { display: grid; gap: 18px; }
  .class-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .class-code {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 0 11px;
    border-radius: var(--rounded-md);
    background: var(--primary-soft);
    color: var(--primary);
    font-size: 13px;
    font-weight: 900;
  }
  .class-meta { display: flex; flex-wrap: wrap; gap: 8px; }
  .pill {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 0 11px;
    border-radius: var(--rounded-sm);
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid var(--line);
    color: #475569;
    font-size: 13px;
    font-weight: 800;
  }
  article.card { transition: transform 160ms ease, box-shadow 160ms ease, outline-color 160ms ease; }
  article.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-strong); outline-color: var(--primary-tint); }
  .metric { color: var(--ink); font-size: 28px; font-weight: 900; margin-top: 8px; font-variant-numeric: tabular-nums; }
  .metric-line { color: var(--ink); font-size: 18px; font-weight: 900; }
  .muted { color: var(--muted); }
  .small { font-size: 13px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .button, button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 16px;
    border-radius: var(--rounded-sm);
    border: 1px solid color-mix(in srgb, var(--primary), black 8%);
    background: linear-gradient(180deg, color-mix(in srgb, var(--primary), white 10%), var(--primary));
    color: #fff;
    box-shadow: 0 10px 24px color-mix(in srgb, var(--primary), transparent 72%);
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
  }
  .button:hover, button:hover { transform: translateY(-1px); box-shadow: 0 14px 32px color-mix(in srgb, var(--primary), transparent 68%); }
  .button.secondary, button.secondary { background: rgba(255, 255, 255, 0.82); color: var(--ink); border-color: var(--line); box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06); }
  .button.secondary:hover, button.secondary:hover { border-color: var(--primary-tint); box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); }
  .button.danger { background: #fff; color: var(--danger); border-color: #fecaca; box-shadow: 0 8px 22px rgba(185, 28, 28, 0.06); }
  .table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--rounded-lg);
    overflow: hidden;
    box-shadow: var(--shadow);
  }
  .table th, .table td { padding: 18px 28px; text-align: left; border-bottom: 1px solid rgba(226, 232, 240, 0.9); font-size: 14px; font-variant-numeric: tabular-nums; }
  .table th { background: linear-gradient(180deg, #f8fafc, color-mix(in srgb, var(--primary), white 94%)); color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
  .table tbody tr { transition: background-color 150ms ease; }
  .table tbody tr:hover { background: color-mix(in srgb, var(--primary), white 96%); }
  .table tr:last-child td { border-bottom: 0; }
  .cell-title { color: var(--ink); font-weight: 900; }
  .cell-subtitle { margin-top: 3px; color: var(--muted); font-size: 13px; }
  .empty-state {
    padding: 28px;
    text-align: center;
    background: rgba(255, 255, 255, 0.46);
  }
  .empty-state h2 { font-size: 20px; }
  .empty-state p { max-width: 520px; margin-left: auto; margin-right: auto; }
  .login-wrap { max-width: 430px; margin: 9vh auto; padding: 0 20px; }
  .login {
    background: var(--surface);
    border: 1px solid rgba(255, 255, 255, 0.82);
    border-radius: var(--rounded-lg);
    padding: 28px;
    box-shadow: var(--shadow-strong);
    outline: 1px solid var(--line);
  }
  label { display: grid; gap: 7px; font-size: 13px; font-weight: 800; color: #334155; }
  input {
    min-height: 42px;
    border: 1px solid var(--line);
    border-radius: var(--rounded-xs);
    padding: 0 20px;
    background: rgba(255, 255, 255, 0.86);
    color: var(--ink);
    font-family: var(--font-sans);
    font-size: 14px;
    outline: none;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  input:focus { border-color: var(--primary-tint); box-shadow: 0 0 0 4px var(--primary-soft); }
  .form-stack { display: grid; gap: 14px; margin-top: 18px; }
  .notice { background: #ecfdf5; border: 1px solid #bbf7d0; color: #166534; border-radius: 8px; padding: 12px 14px; font-weight: 800; }
  .error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 8px; padding: 12px 14px; font-weight: 800; }
  #qr-wrap {
    display: grid;
    place-items: center;
    min-height: 316px;
    background: linear-gradient(145deg, rgba(255,255,255,0.94), color-mix(in srgb, var(--primary), white 96%));
    border: 1px solid var(--line);
    border-radius: var(--rounded-lg);
    box-shadow: var(--shadow);
  }
  #qr canvas, #qr img { border-radius: 8px; }
  #status { min-height: 28px; font-weight: 900; color: var(--success); }
  #scan-url { overflow-wrap: anywhere; font-size: 13px; color: #475569; }
  .live-grid { display: grid; grid-template-columns: minmax(300px, 1.15fr) minmax(280px, 0.85fr); gap: 18px; align-items: start; }
  .qr-caption { margin-top: 14px; }
  .log-list { display: grid; gap: 10px; margin-top: 12px; }
  .log-list p {
    margin: 0;
    padding: 12px 20px;
    background: rgba(255, 255, 255, 0.62);
    border: 1px solid var(--line);
    border-radius: var(--rounded-sm);
    color: #334155;
    font-size: 14px;
  }
  .support-list { display: grid; gap: 10px; margin: 16px 0 0; padding: 0; list-style: none; }
  .support-list li { display: flex; gap: 10px; color: #475569; line-height: 1.45; }
  .support-list li::before { content: ""; flex: 0 0 7px; width: 7px; height: 7px; margin-top: 8px; border-radius: 999px; background: var(--primary); }
  @media (max-width: 720px) {
    .topbar-inner, .page-head, .row, .section-head, .class-top { align-items: flex-start; flex-direction: column; }
    .hero-panel, .live-grid { grid-template-columns: 1fr; }
    .summary-grid { grid-template-columns: 1fr; }
    .main { padding: 24px 16px 48px; }
    .table { display: block; overflow-x: auto; }
  }
`;

function cookieSecure(c: AppContext) {
  return new URL(c.req.url).protocol === "https:";
}

async function currentTeacher(c: AppContext) {
  const token = getCookie(c, TEACHER_SESSION_COOKIE);
  if (!token) return null;

  return getTeacherBySessionToken(c.env.DB_external_dummy, token);
}

async function currentTeacherSession(c: AppContext) {
  const token = getCookie(c, TEACHER_SESSION_COOKIE);
  if (!token) return null;

  const teacher = await getTeacherBySessionToken(
    c.env.DB_external_dummy,
    token,
  );
  return teacher ? { token, teacher } : null;
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
  const token = getCookie(c, TEACHER_SESSION_COOKIE);
  const verified = await isTeacherPinRecentlyVerified(
    c.env.DB_external_dummy,
    token,
  );
  if (verified) return null;

  return c.redirect(
    `/teacher/verify-pin?next=${encodeURIComponent(currentPath(c))}`,
  );
}

function layout(title: string, teacher: ExternalTeacher | null, children: any) {
  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{styles}</style>
      </head>
      <body>
        <div class="shell">
          <header class="topbar">
            <div class="topbar-inner">
              <a class="brand" href="/teacher/class">
                Attendance
              </a>
              {teacher ? (
                <div class="nav">
                  <span>{teacher.name}</span>
                  <form method="post" action="/teacher/logout">
                    <button class="secondary" type="submit">
                      Sign out
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </header>
          <main class="main">{children}</main>
        </div>
      </body>
    </html>
  );
}

function loginPage(error?: string) {
  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>Teacher Login</title>
        <style>{styles}</style>
      </head>
      <body>
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
      </body>
    </html>
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
  );
}

async function loadOwnedClass(c: AppContext, teacher: ExternalTeacher) {
  const classId = c.req.param("classId") || c.req.param("classid");
  if (!classId) return null;
  const allowed = await teacherCanAccessClass(
    c.env.DB_external_dummy,
    teacher.id,
    classId,
  );
  if (!allowed) return null;

  return getClassById(c.env.DB_external_dummy, classId);
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
  const pin = boundedFormText(body.pin, 32);
  const pinLimit = await rateLimit(
    c.env.KV_lunar_attendance,
    `teacher-pin:${requestIp(c.req.raw)}:${session.teacher.id}`,
    5,
    5 * 60,
  );
  if (!pinLimit.allowed) {
    return c.html(
      pinVerifyPage(
        session.teacher,
        next,
        "Too many PIN attempts. Try again in a few minutes.",
      ),
      429,
    );
  }

  const ok = await verifyTeacherSessionPin(
    c.env.DB_external_dummy,
    session.token,
    pin,
  );
  if (!ok) {
    return c.html(pinVerifyPage(session.teacher, next, "Invalid PIN"), 401);
  }

  return c.redirect(next);
});

teacherRoutes.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = boundedFormText(body.email, 254);
  const pin = boundedFormText(body.pin, 32);
  const loginLimit = await rateLimit(
    c.env.KV_lunar_attendance,
    `teacher-login:${requestIp(c.req.raw)}:${email.trim().toLowerCase()}`,
    8,
    5 * 60,
  );
  if (!loginLimit.allowed) {
    return c.html(
      loginPage("Too many sign-in attempts. Try again in a few minutes."),
      429,
    );
  }
  const teacher = await findTeacherByCredentials(
    c.env.DB_external_dummy,
    email,
    pin,
  );

  if (!teacher) {
    return c.html(loginPage("Invalid teacher email or PIN"), 401);
  }

  const session = await createTeacherSession(
    c.env.DB_external_dummy,
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
  if (token) await deleteTeacherSession(c.env.DB_external_dummy, token);
  deleteCookie(c, TEACHER_SESSION_COOKIE, { path: "/" });
  return c.redirect("/teacher/class");
});

teacherRoutes.get("/class", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.html(loginPage());

  const classes = await listTeacherClasses(c.env.DB_external_dummy, teacher.id);
  const classCards = await Promise.all(
    classes.map(async (classItem) => ({
      ...classItem,
      studentCount: await countClassStudents(
        c.env.DB_external_dummy,
        classItem.id,
      ),
    })),
  );
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
    c.env.DB_external_dummy,
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

  const rosterSizeRow = await c.env.DB_external_dummy.prepare(
    `SELECT COUNT(*) AS total
         FROM student_classes
        WHERE class_id = ?`,
  )
    .bind(classItem.id)
    .first<{ total: number }>();
  const rosterSize = rosterSizeRow?.total ?? 0;

  const attendanceDays = await listClassAttendanceDays(
    c.env.DB_external_dummy,
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

teacherRoutes.get("/class/:classId/attendance/start", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const classItem = await loadOwnedClass(c, teacher);
  if (!classItem) return c.text("Class not found", 404);
  const pinResponse = await requireRecentTeacherPin(c, teacher);
  if (pinResponse) return pinResponse;

  return c.html(
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>{classItem.code} Attendance</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" />
        <style>{styles}</style>
      </head>
      <body>
        <div class="shell">
          <header class="topbar">
            <div class="topbar-inner">
              <a class="brand" href="/teacher/class">
                Attendance
              </a>
              <div class="nav">
                <span>{teacher.name}</span>
                <a
                  class="button secondary"
                  href={`/teacher/class/${classItem.id}/attendance`}
                >
                  Back to stats
                </a>
              </div>
            </div>
          </header>
          <main class="main">
            <div class="page-head">
              <div class="page-copy">
                <div class="eyebrow">{classItem.code}</div>
                <h1>Live attendance</h1>
                <p>
                  Keep this screen visible during class. The QR refreshes
                  automatically and each successful scan appears in the log.
                </p>
              </div>
              <button id="restartBtn" class="secondary" type="button">
                New QR
              </button>
            </div>
            <div class="live-grid">
              <section>
                <div class="section-head" style="margin-top: 0;">
                  <div>
                    <h2>Student scan code</h2>
                    <p>
                      Students scan this code from the browser that claimed
                      their access QR.
                    </p>
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
          </main>
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
              if (msg.type === 'qr_ready') renderQr(msg.url)
              if (msg.type === 'attended') {
                showAttended(msg.studentName, msg.alreadyMarked)
                setTimeout(() => renderQr(msg.url), 1200)
                appendLog(msg.studentName, msg.alreadyMarked)
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

          function showAttended(name, alreadyMarked) {
            const status = document.getElementById('status')
            status.textContent = alreadyMarked ? name + ' was already present' : name + ' marked present'
            clearTimeout(statusTimer)
            statusTimer = setTimeout(() => status.textContent = '', 3500)
          }

          function appendLog(name, alreadyMarked) {
            const row = document.createElement('p')
            row.textContent = name + (alreadyMarked ? ' already present - ' : ' - ') + new Date().toLocaleTimeString()
            const log = document.getElementById('log')
            const empty = log.querySelector('[data-empty-log]')
            if (empty) empty.remove()
            log.prepend(row)
          }

          document.getElementById('restartBtn').addEventListener('click', () => startSession().catch(showError))

          function showError(error) {
            document.getElementById('status').textContent = error.message
          }

          startSession().catch(showError)
        `,
          }}
        />
      </body>
    </html>,
  );
});

teacherRoutes.get("/class/:classId/student/attendance", async (c) => {
  const teacher = await currentTeacher(c);
  if (!teacher) return c.redirect("/teacher/class");

  const classItem = await loadOwnedClass(c, teacher);
  if (!classItem) return c.text("Class not found", 404);
  const pinResponse = await requireRecentTeacherPin(c, teacher);
  if (pinResponse) return pinResponse;

  const students = await listClassStudents(
    c.env.DB_external_dummy,
    classItem.id,
  );
  const rows = await listStudentAttendanceSummaries(
    c.env.DB_external_dummy,
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
      c.env.DB_external_dummy,
      classItem.id,
      studentId,
    );
    if (!student) return c.text("Student not found", 404);

    const rows = await listStudentAttendanceRecords(
      c.env.DB_external_dummy,
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
                <th>Time</th>
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
                  <td colspan={5}>No attendance recorded for this student.</td>
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
    c.env.DB_external_dummy,
    classItem.id,
    studentId,
  );
  if (!student) return c.text("Student not found", 404);

  const grant = await createStudentAccessGrant(
    c.env.DB_external_dummy,
    student.id,
    teacher.id,
  );
  const accessUrl = `${new URL(c.req.url).origin}/student/access?t=${encodeURIComponent(grant.token)}`;

  return c.html(
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>{student.name} Access</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" />
        <style>{styles}</style>
      </head>
      <body>
        <div class="shell">
          <header class="topbar">
            <div class="topbar-inner">
              <a class="brand" href="/teacher/class">
                Attendance
              </a>
              <div class="nav">
                <span>{teacher.name}</span>
                <a
                  class="button secondary"
                  href={`/teacher/class/${classItem.id}/student`}
                >
                  Students
                </a>
              </div>
            </div>
          </header>
          <main class="main">
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
                  <li>
                    QR expires at{" "}
                    {new Date(grant.expiresAt * 1000).toLocaleString()}.
                  </li>
                  <li>QR can only be claimed once.</li>
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
          </main>
        </div>
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
      </body>
    </html>,
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
