/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Env } from "../types";
import { localDateKey } from "../lib/date";
import {
  assignTeacherToClass,
  createClass,
  createStudent,
  createTeacher,
  deleteClass,
  deleteStudent,
  deleteTeacher,
  enrollStudentInClass,
  getClassFull,
  listAllClasses,
  listAllStudents,
  listAllTeachers,
  listAssignedTeachers,
  listEnrolledStudents,
  listUnassignedTeachers,
  listUnenrolledStudents,
  removeStudentFromClass,
  removeTeacherFromClass,
  listAllAttendanceRecords,
  listAllAttendanceRecordsForExport,
  deleteAttendanceRecord,
  listClassAttendanceDays,
  listStudentAttendanceSummaries,
  getAdminStats,
  listAttendanceForDay,
} from "../lib/externalDummy";
import { signAdminToken, verifyAdminToken, ADMIN_COOKIE } from "../lib/auth";
import { Layout } from "../components/Layout";
import { requestIp } from "../lib/rateLimit";
import {
  deleteAllowedWifiIp,
  listAllowedWifiIps,
  normalizeIpAddress,
  saveAllowedWifiIp,
  setAllowedWifiIpEnabled,
} from "../lib/wifi";

export const adminRoutes = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

function boundedText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}
// ── Login page ───────────────────────────────────────────────────────
function loginPage(c: AppContext, error?: string) {
  return c.html(
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Admin Login</title>
        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap");
          * { box-sizing: border-box; }
          body {
            margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
            font-family: "Plus Jakarta Sans", system-ui, sans-serif; background: #f8fafc;
            -webkit-font-smoothing: antialiased;
          }
          .login-card {
            background: white; border-radius: 1rem; padding: 3rem; width: 100%; max-width: 400px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0;
          }
          .login-brand { font-weight: 800; font-size: 1.5rem; text-align: center; margin-bottom: 0.5rem; color: #0f172a; }
          .login-brand span { color: #d97706; }
          .login-sub { text-align: center; color: #64748b; font-size: 0.9rem; margin-bottom: 2rem; }
          label { font-size: 0.8rem; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.5rem; }
          input {
            width: 100%; padding: 0.85rem 1rem; border: 1px solid #e2e8f0; border-radius: 0.75rem;
            font-family: inherit; font-size: 1rem; outline: none; transition: all 0.2s;
            background: #f8fafc; color: #0f172a;
          }
          input:focus { border-color: #d97706; box-shadow: 0 0 0 3px #fef3c7; background: white; }
          .btn {
            width: 100%; padding: 0.85rem; border-radius: 0.75rem; font-weight: 600; font-size: 1rem;
            cursor: pointer; border: none; background: #d97706; color: white; font-family: inherit;
            margin-top: 1.5rem; transition: all 0.2s;
          }
          .btn:hover { background: #b45309; }
          .error {
            background: #fee2e2; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem;
            font-size: 0.85rem; font-weight: 600; margin-bottom: 1.5rem; text-align: center;
          }
        `}</style>
      </head>
      <body>
        <div class="login-card">
          <div class="login-brand">
            LUNAR <span>ADMIN</span>
          </div>
          <div class="login-sub">Enter your admin secret to continue</div>
          {error && <div class="error">{error}</div>}
          <form method="post" action="/admin/login">
            <label>Admin Secret</label>
            <input
              name="secret"
              type="password"
              placeholder="Enter secret..."
              required
              autofocus
            />
            <button type="submit" class="btn">
              Sign In
            </button>
          </form>
        </div>
      </body>
    </html>,
  );
}
adminRoutes.get("/login", async (c) => {
  // If already authenticated, redirect to dashboard
  const token = getCookie(c, ADMIN_COOKIE);
  if (token && (await verifyAdminToken(token, c.env.ADMIN_SECRET))) {
    return c.redirect("/admin");
  }
  return loginPage(c);
});
adminRoutes.post("/login", async (c) => {
  const { secret } = await c.req.parseBody<{ secret: string }>();
  if (secret !== c.env.ADMIN_SECRET) {
    return loginPage(c, "Invalid secret. Please try again.");
  }
  const token = await signAdminToken(c.env.ADMIN_SECRET);
  setCookie(c, ADMIN_COOKIE, token, {
    path: "/admin",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 86400,
  });
  return c.redirect("/admin");
});
adminRoutes.get("/logout", async (c) => {
  deleteCookie(c, ADMIN_COOKIE, { path: "/admin" });
  return c.redirect("/admin/login");
});
// ── Auth middleware (protects all routes below) ──────────────────────
adminRoutes.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/admin/login") return next();
  const token = getCookie(c, ADMIN_COOKIE);
  if (!token || !(await verifyAdminToken(token, c.env.ADMIN_SECRET))) {
    return c.redirect("/admin/login");
  }
  await next();
});
// ── Shared layout helper ─────────────────────────────────────────────
function layout(
  c: AppContext,
  title: string,
  activeTab: string,
  children: any,
) {
  return c.html(
    <Layout role="admin" title={`${title} – Admin`} adminActiveTab={activeTab}>
      {children}
    </Layout>,
  );
}

// Icons
const IconPlus = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2"
  >
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);
const IconTrash = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);
const IconDownload = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconSearch = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconBack = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M10 19l-7-7m0 0l7-7m-7 7h18"
    />
  </svg>
);
// ── Overview ─────────────────────────────────────────────────────────
adminRoutes.get("/", async (c) => {
  const stats = await getAdminStats(c.env.DB_lunar_attendance);
  return layout(
    c,
    "Overview",
    "overview",
    <>
      <div style="margin-bottom: 2.5rem;">
        <h1 style="margin: 0; font-size: 2rem;">System Overview</h1>
        <p class="text-muted" style="margin: 0.5rem 0 0;">
          Administrative control panel and system statistics.
        </p>
      </div>
      <div class="grid">
        <div class="stat-card">
          <div class="stat-label">Total Teachers</div>
          <div class="stat-value">{stats.teachers}</div>
          <a
            href="/admin/teachers"
            class="btn btn-secondary"
            style="width: 100%;"
          >
            Manage Teachers →
          </a>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Students</div>
          <div class="stat-value">{stats.students}</div>
          <a
            href="/admin/students"
            class="btn btn-secondary"
            style="width: 100%;"
          >
            Manage Students →
          </a>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Classes</div>
          <div class="stat-value">{stats.classes}</div>
          <a
            href="/admin/classes"
            class="btn btn-secondary"
            style="width: 100%;"
          >
            Manage Classes →
          </a>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Attendance</div>
          <div class="stat-value">{stats.attendance}</div>
          <a
            href="/admin/attendance"
            class="btn btn-secondary"
            style="width: 100%;"
          >
            View Logs →
          </a>
        </div>
      </div>
    </>,
  );
});

// ── Teachers ─────────────────────────────────────────────────────────
adminRoutes.get("/teachers", async (c) => {
  const search = c.req.query("q");
  const teachers = await listAllTeachers(c.env.DB_lunar_attendance, search);
  return layout(
    c,
    "Manage Teachers",
    "teachers",
    <>
      <div class="flex-between" style="margin-bottom: 2rem;">
        <h1 style="margin: 0;">Teachers</h1>
        <div style="display: flex; gap: 0.5rem;">
          <form
            method="get"
            action="/admin/teachers"
            style="display: flex; gap: 0.5rem;"
          >
            <div style="position: relative;">
              <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none;">
                <IconSearch />
              </span>
              <input
                type="text"
                name="q"
                placeholder="Search teachers..."
                value={search || ""}
                class="btn"
                style="padding-left: 2.5rem; width: 240px; text-align: left; background: var(--bg); border: 1px solid var(--line);"
              />
            </div>
            {search && (
              <a href="/admin/teachers" class="btn btn-secondary">
                Clear
              </a>
            )}
          </form>
        </div>
      </div>
      <form class="inline-form" method="post" action="/admin/teachers">
        <div class="field">
          <label>Full Name</label>
          <input name="name" placeholder="Ada Sharma" required />
        </div>
        <div class="field">
          <label>Email Address</label>
          <input
            name="email"
            type="email"
            placeholder="ada@example.com"
            required
          />
        </div>
        <div class="field">
          <label>PIN (4 digits)</label>
          <input
            name="pin"
            type="text"
            pattern="[0-9]{4}"
            placeholder="1234"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary">
          <IconPlus /> Add Teacher
        </button>
      </form>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>ID</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr>
                <td class="font-semibold">{t.name}</td>
                <td class="text-muted">{t.email}</td>
                <td>
                  <span class="badge">{t.id}</span>
                </td>
                <td style="text-align: right;">
                  <form
                    method="post"
                    action={`/admin/teachers/${t.id}/delete`}
                    onsubmit="return confirm('Delete teacher?')"
                  >
                    <button class="btn btn-danger btn-icon" title="Delete">
                      <IconTrash />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colspan={4}>
                  <div class="empty-state">
                    No teachers found. Add your first teacher above.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>,
  );
});
adminRoutes.post("/teachers", async (c) => {
  const { name, email, pin } = await c.req.parseBody<{
    name: string;
    email: string;
    pin: string;
  }>();
  await createTeacher(c.env.DB_lunar_attendance, name, email, pin);
  return c.redirect("/admin/teachers");
});
adminRoutes.post("/teachers/:id/delete", async (c) => {
  await deleteTeacher(c.env.DB_lunar_attendance, c.req.param("id"));
  return c.redirect("/admin/teachers");
});
// ── Students ─────────────────────────────────────────────────────────
adminRoutes.get("/students", async (c) => {
  const search = c.req.query("q");
  const students = await listAllStudents(c.env.DB_lunar_attendance, search);
  return layout(
    c,
    "Manage Students",
    "students",
    <>
      <div class="flex-between" style="margin-bottom: 2rem;">
        <h1 style="margin: 0;">Students</h1>
        <div style="display: flex; gap: 0.5rem;">
          <form
            method="get"
            action="/admin/students"
            style="display: flex; gap: 0.5rem;"
          >
            <div style="position: relative;">
              <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none;">
                <IconSearch />
              </span>
              <input
                type="text"
                name="q"
                placeholder="Search students..."
                value={search || ""}
                class="btn"
                style="padding-left: 2.5rem; width: 240px; text-align: left; background: var(--bg); border: 1px solid var(--line);"
              />
            </div>
            {search && (
              <a href="/admin/students" class="btn btn-secondary">
                Clear
              </a>
            )}
          </form>
        </div>
      </div>
      <form class="inline-form" method="post" action="/admin/students">
        <div class="field">
          <label>Full Name</label>
          <input name="name" placeholder="John Doe" required />
        </div>
        <div class="field">
          <label>Email Address</label>
          <input
            name="email"
            type="email"
            placeholder="john@example.com"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary">
          <IconPlus /> Add Student
        </button>
      </form>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>ID</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr>
                <td class="font-semibold">{s.name}</td>
                <td class="text-muted">{s.email}</td>
                <td>
                  <span class="badge">{s.id}</span>
                </td>
                <td style="text-align: right;">
                  <form
                    method="post"
                    action={`/admin/students/${s.id}/delete`}
                    onsubmit="return confirm('Delete student?')"
                  >
                    <button class="btn btn-danger btn-icon" title="Delete">
                      <IconTrash />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colspan={4}>
                  <div class="empty-state">
                    No students found. Add your first student above.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>,
  );
});
adminRoutes.post("/students", async (c) => {
  const { name, email } = await c.req.parseBody<{
    name: string;
    email: string;
  }>();
  await createStudent(c.env.DB_lunar_attendance, name, email);
  return c.redirect("/admin/students");
});
adminRoutes.post("/students/:id/delete", async (c) => {
  await deleteStudent(c.env.DB_lunar_attendance, c.req.param("id"));
  return c.redirect("/admin/students");
});
// ── Classes ──────────────────────────────────────────────────────────
adminRoutes.get("/classes", async (c) => {
  const classes = await listAllClasses(c.env.DB_lunar_attendance);
  return layout(
    c,
    "Classes",
    "classes",
    <>
      <div class="flex-between" style="margin-bottom: 1.5rem;">
        <h1 style="margin: 0;">Classes</h1>
      </div>
      <form class="inline-form" method="post" action="/admin/classes">
        <div class="field">
          <label>Class Name</label>
          <input name="name" placeholder="Advanced React" required />
        </div>
        <div class="field">
          <label>Class Code</label>
          <input name="code" placeholder="REACT-401" required />
        </div>
        <button type="submit" class="btn btn-primary">
          <IconPlus /> Create Class
        </button>
      </form>
      {classes.length === 0 ? (
        <div class="empty-state" style="margin-top: 2rem;">
          No classes found. Create your first class above.
        </div>
      ) : (
        <div class="grid">
          {classes.map((cls) => (
            <div class="card card-interactive" style="margin-bottom: 0;">
              <div class="flex-between" style="margin-bottom: 0.5rem;">
                <span class="badge badge-primary">{cls.code}</span>
                <form
                  method="post"
                  action={`/admin/classes/${cls.id}/delete`}
                  onsubmit="return confirm('Delete class?')"
                >
                  <button
                    class="btn btn-ghost btn-icon"
                    title="Delete Class"
                    style="padding: 0.25rem; color: var(--danger);"
                  >
                    <IconTrash />
                  </button>
                </form>
              </div>
              <h2 style="margin: 0.5rem 0 1.5rem;">{cls.name}</h2>
              <a
                href={`/admin/classes/${cls.id}`}
                class="btn btn-secondary"
                style="width: 100%;"
              >
                Manage Roster →
              </a>
            </div>
          ))}
        </div>
      )}
    </>,
  );
});
adminRoutes.post("/classes", async (c) => {
  const { name, code } = await c.req.parseBody<{
    name: string;
    code: string;
  }>();
  await createClass(c.env.DB_lunar_attendance, name, code);
  return c.redirect("/admin/classes");
});
adminRoutes.post("/classes/:id/delete", async (c) => {
  await deleteClass(c.env.DB_lunar_attendance, c.req.param("id"));
  return c.redirect("/admin/classes");
});
// ── Class Detail (Enrollment & Assignment) ───────────────────────────
adminRoutes.get("/classes/:id", async (c) => {
  const classId = c.req.param("id");
  const cls = await getClassFull(c.env.DB_lunar_attendance, classId);
  if (!cls) return c.text("Class not found", 404);
  const enrolled = await listEnrolledStudents(
    c.env.DB_lunar_attendance,
    classId,
  );
  const unenrolled = await listUnenrolledStudents(
    c.env.DB_lunar_attendance,
    classId,
  );
  const assigned = await listAssignedTeachers(
    c.env.DB_lunar_attendance,
    classId,
  );
  const unassigned = await listUnassignedTeachers(
    c.env.DB_lunar_attendance,
    classId,
  );
  const attendanceDays = await listClassAttendanceDays(
    c.env.DB_lunar_attendance,
    classId,
  );
  const studentSummaries = await listStudentAttendanceSummaries(
    c.env.DB_lunar_attendance,
    classId,
  );
  // Map student IDs to their attendance count for easy display
  const attendanceMap = new Map(
    studentSummaries.map((s) => [s.studentId, s.daysPresent]),
  );
  return layout(
    c,
    cls.name,
    "classes",
    <>
      <div class="flex-between" style="margin-bottom: 2.5rem;">
        <div class="gap-2">
          <a
            href="/admin/classes"
            class="btn btn-secondary btn-icon"
            title="Back to Classes"
            style="margin-right: 0.5rem;"
          >
            <IconBack />
          </a>
          <h1 style="margin: 0;">
            {cls.name}{" "}
            <span
              class="badge badge-primary"
              style="vertical-align: middle; margin-left: 0.5rem;"
            >
              {cls.code}
            </span>
          </h1>
        </div>
        <div>
          <a
            href={`/admin/classes/${classId}/onboarding`}
            class="btn btn-primary"
          >
            Student Onboarding QR
          </a>
        </div>
      </div>
      <div class="class-split">
        {/* Students Section */}
        <section>
          <h2 style="margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
            Enrolled Students
            <span class="badge">{enrolled.length}</span>
          </h2>
          <div class="card" style="padding: 1rem;">
            <div class="scroll-box">
              {enrolled.map((s) => (
                <div class="list-item">
                  <div class="item-info">
                    <span class="item-name">{s.name}</span>
                    <span class="item-email">{s.email}</span>
                  </div>
                  <form
                    method="post"
                    action={`/admin/classes/${classId}/unenroll`}
                  >
                    <input type="hidden" name="studentId" value={s.id} />
                    <button
                      class="btn btn-danger"
                      style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              ))}
              {enrolled.length === 0 && (
                <div class="empty-state" style="padding: 2rem 1rem;">
                  No students enrolled yet.
                </div>
              )}
            </div>
          </div>
          <h3 style="margin: 2.5rem 0 1rem; font-size: 0.85rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em;">
            Available Students
          </h3>
          <div
            class="card"
            style="padding: 1rem; background: var(--bg); box-shadow: none;"
          >
            <div class="scroll-box">
              {unenrolled.map((s) => (
                <div class="list-item">
                  <div class="item-info">
                    <span class="item-name">{s.name}</span>
                    <span class="item-email">{s.email}</span>
                  </div>
                  <form
                    method="post"
                    action={`/admin/classes/${classId}/enroll`}
                  >
                    <input type="hidden" name="studentId" value={s.id} />
                    <button
                      class="btn btn-primary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"
                    >
                      Enroll
                    </button>
                  </form>
                </div>
              ))}
              {unenrolled.length === 0 && (
                <div
                  class="text-muted text-sm text-center"
                  style="padding: 1rem;"
                >
                  All students are enrolled in this class.
                </div>
              )}
            </div>
          </div>
        </section>
        {/* Teachers Section */}
        <section>
          <h2 style="margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
            Assigned Teachers
            <span class="badge">{assigned.length}</span>
          </h2>
          <div class="card" style="padding: 1rem;">
            <div class="scroll-box">
              {assigned.map((t) => (
                <div class="list-item">
                  <div class="item-info">
                    <span class="item-name">{t.name}</span>
                    <span class="item-email">{t.email}</span>
                  </div>
                  <form
                    method="post"
                    action={`/admin/classes/${classId}/unassign`}
                  >
                    <input type="hidden" name="teacherId" value={t.id} />
                    <button
                      class="btn btn-danger"
                      style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"
                    >
                      Unassign
                    </button>
                  </form>
                </div>
              ))}
              {assigned.length === 0 && (
                <div class="empty-state" style="padding: 2rem 1rem;">
                  No teachers assigned yet.
                </div>
              )}
            </div>
          </div>
          <h3 style="margin: 2.5rem 0 1rem; font-size: 0.85rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em;">
            Available Teachers
          </h3>
          <div
            class="card"
            style="padding: 1rem; background: var(--bg); box-shadow: none;"
          >
            <div class="scroll-box">
              {unassigned.map((t) => (
                <div class="list-item">
                  <div class="item-info">
                    <span class="item-name">{t.name}</span>
                    <span class="item-email">{t.email}</span>
                  </div>
                  <form
                    method="post"
                    action={`/admin/classes/${classId}/assign`}
                  >
                    <input type="hidden" name="teacherId" value={t.id} />
                    <button
                      class="btn btn-primary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"
                    >
                      Assign
                    </button>
                  </form>
                </div>
              ))}
              {unassigned.length === 0 && (
                <div
                  class="text-muted text-sm text-center"
                  style="padding: 1rem;"
                >
                  All teachers are assigned to this class.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      <hr style="margin: 4rem 0; border: 0; border-top: 1px solid var(--line);" />
      <section>
        <div class="flex-between" style="margin-bottom: 1.5rem;">
          <h2 style="margin: 0;">Attendance Summary</h2>
          <div class="badge badge-primary">
            {attendanceDays.length} DAYS RECORDED
          </div>
        </div>

        <div
          class="grid"
          style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));"
        >
          {enrolled.map((s) => {
            const count = attendanceMap.get(s.id) || 0;
            const percent =
              attendanceDays.length > 0
                ? Math.round((count / attendanceDays.length) * 100)
                : 0;
            return (
              <div class="card" style="padding: 1.5rem; margin-bottom: 0;">
                <div class="flex-between" style="margin-bottom: 0.5rem;">
                  <span class="font-semibold">{s.name}</span>
                  <span class={`badge ${count > 0 ? "badge-primary" : ""}`}>
                    {count} / {attendanceDays.length}
                  </span>
                </div>
                <div style="height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; margin-top: 1rem;">
                  <div
                    style={`height: 100%; width: ${percent}%; background: var(--primary); transition: width 1s ease;`}
                  ></div>
                </div>
                <div
                  class="text-muted text-sm"
                  style="margin-top: 0.5rem; display: flex; justify-content: space-between;"
                >
                  <span>Attendance Rate</span>
                  <span>{percent}%</span>
                </div>
              </div>
            );
          })}
          {enrolled.length === 0 && (
            <div class="card" style="grid-column: 1 / -1;">
              <div class="empty-state">
                Enroll students to see attendance summaries.
              </div>
            </div>
          )}
        </div>
      </section>
    </>,
  );
});
adminRoutes.get("/classes/:id/onboarding", async (c) => {
  const classId = c.req.param("id");
  const cls = await getClassFull(c.env.DB_lunar_attendance, classId);
  if (!cls) return c.text("Class not found", 404);

  const tokenPayload = await import("../lib/token").then((m) =>
    m.createToken(
      {
        type: "new_student",
        classId,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      },
      c.env.ADMIN_SECRET,
    ),
  );
  const url = `${new URL(c.req.url).origin}/register?token=${encodeURIComponent(tokenPayload)}`;

  return layout(
    c,
    "Class Onboarding QR",
    "classes",
    <>
      <div class="flex-between" style="margin-bottom: 2.5rem;">
        <div class="gap-2">
          <a
            href={`/admin/classes/${classId}`}
            class="btn btn-secondary btn-icon"
            title="Back to Class"
          >
            <IconBack />
          </a>
          <h1 style="margin: 0;">Onboarding QR: {cls.name}</h1>
        </div>
      </div>
      <div class="card" style="text-align: center; padding: 2rem;">
        <p>
          Scan this QR to register and enroll in <strong>{cls.name}</strong>
        </p>
        <div style="background: white; padding: 1rem; display: inline-block; border-radius: 8px;">
          <div id="qr-wrap">
            <div id="qr"></div>
          </div>
        </div>
        <div style="margin-top: 1rem; display: flex; gap: 1rem;">
          <a
            href={url}
            target="_blank"
            class="btn btn-primary"
            style="flex: 1;"
          >
            Open in new tab
          </a>
          <button
            class="btn btn-secondary"
            onclick={`navigator.clipboard.writeText("${url}")`}
            style="flex: 1;"
          >
            Copy URL
          </button>
        </div>
      </div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" />

      <script
        dangerouslySetInnerHTML={{
          __html: `
          new QRCode(document.getElementById('qr'), {
            text: ${JSON.stringify(url)},
            width: 280,
            height: 280,
            correctLevel: QRCode.CorrectLevel.H
          })
        `,
        }}
      />
    </>,
  );
});

adminRoutes.post("/classes/:id/enroll", async (c) => {
  const { studentId } = await c.req.parseBody<{ studentId: string }>();
  await enrollStudentInClass(
    c.env.DB_lunar_attendance,
    studentId,
    c.req.param("id"),
  );
  return c.redirect(`/admin/classes/${c.req.param("id")}`);
});
adminRoutes.post("/classes/:id/unenroll", async (c) => {
  const { studentId } = await c.req.parseBody<{ studentId: string }>();
  await removeStudentFromClass(
    c.env.DB_lunar_attendance,
    studentId,
    c.req.param("id"),
  );
  return c.redirect(`/admin/classes/${c.req.param("id")}`);
});
adminRoutes.post("/classes/:id/assign", async (c) => {
  const { teacherId } = await c.req.parseBody<{ teacherId: string }>();
  await assignTeacherToClass(
    c.env.DB_lunar_attendance,
    teacherId,
    c.req.param("id"),
  );
  return c.redirect(`/admin/classes/${c.req.param("id")}`);
});
adminRoutes.post("/classes/:id/unassign", async (c) => {
  const { teacherId } = await c.req.parseBody<{ teacherId: string }>();
  await removeTeacherFromClass(
    c.env.DB_lunar_attendance,
    teacherId,
    c.req.param("id"),
  );
  return c.redirect(`/admin/classes/${c.req.param("id")}`);
});

// ── Wi-Fi IP Allowlist ───────────────────────────────────────────────
adminRoutes.get("/wifi", async (c) => {
  const wifiIps = await listAllowedWifiIps(c.env.DB_lunar_attendance);
  const currentIp = requestIp(c.req.raw);
  const normalizedCurrentIp = normalizeIpAddress(currentIp);
  const invalidIp = c.req.query("error") === "invalid-ip";

  return layout(
    c,
    "Wi-Fi IPs",
    "wifi",
    <>
      <div class="flex-between" style="margin-bottom: 1.5rem;">
        <div>
          <h1 style="margin: 0;">Wi-Fi IP Allowlist</h1>
          <p class="text-muted" style="margin: 0.5rem 0 0;">
            Attendance scans are accepted from enabled public IP addresses.
          </p>
        </div>
        <div class="badge">
          Current IP: {normalizedCurrentIp ?? currentIp}
        </div>
      </div>

      {invalidIp && (
        <div
          class="empty-state"
          style="margin-bottom: 1rem; background: var(--danger-soft); color: var(--danger);"
        >
          Enter a valid IPv4 or IPv6 address.
        </div>
      )}

      <form class="inline-form" method="post" action="/admin/wifi">
        <div class="field">
          <label>Network Label</label>
          <input name="label" placeholder="Main campus Wi-Fi" required />
        </div>
        <div class="field">
          <label>Public IP Address</label>
          <input
            name="ipAddress"
            placeholder="203.0.113.10"
            value={normalizedCurrentIp ?? ""}
            required
          />
        </div>
        <button type="submit" class="btn btn-primary">
          <IconPlus /> Add IP
        </button>
      </form>

      {wifiIps.length === 0 ? (
        <div class="empty-state" style="margin-top: 2rem;">
          No Wi-Fi IPs configured. Attendance will use the teacher session IP
          until an IP is added here.
        </div>
      ) : (
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Label</th>
                <th>IP Address</th>
                <th>Created</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wifiIps.map((ip) => (
                <tr>
                  <td>
                    <span class={`badge ${ip.enabled ? "badge-primary" : ""}`}>
                      {ip.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td class="font-semibold">{ip.label}</td>
                  <td>
                    <span class="badge">{ip.ipAddress}</span>
                  </td>
                  <td class="text-muted text-sm">
                    {new Date(ip.createdAt * 1000).toLocaleString()}
                  </td>
                  <td style="text-align: right;">
                    <div
                      style="display: flex; gap: 0.5rem; justify-content: flex-end;"
                    >
                      <form
                        method="post"
                        action={`/admin/wifi/${ip.id}/${ip.enabled ? "disable" : "enable"}`}
                      >
                        <button class="btn btn-secondary">
                          {ip.enabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                      <form
                        method="post"
                        action={`/admin/wifi/${ip.id}/delete`}
                        onsubmit="return confirm('Delete this Wi-Fi IP?')"
                      >
                        <button class="btn btn-danger btn-icon" title="Delete">
                          <IconTrash />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>,
  );
});

adminRoutes.post("/wifi", async (c) => {
  const body = await c.req.parseBody();
  const result = await saveAllowedWifiIp(
    c.env.DB_lunar_attendance,
    boundedText(body.label, 80),
    boundedText(body.ipAddress, 80),
  );

  if (!result.ok) {
    return c.redirect("/admin/wifi?error=invalid-ip");
  }

  return c.redirect("/admin/wifi");
});

adminRoutes.post("/wifi/:id/enable", async (c) => {
  await setAllowedWifiIpEnabled(
    c.env.DB_lunar_attendance,
    c.req.param("id"),
    true,
  );
  return c.redirect("/admin/wifi");
});

adminRoutes.post("/wifi/:id/disable", async (c) => {
  await setAllowedWifiIpEnabled(
    c.env.DB_lunar_attendance,
    c.req.param("id"),
    false,
  );
  return c.redirect("/admin/wifi");
});

adminRoutes.post("/wifi/:id/delete", async (c) => {
  await deleteAllowedWifiIp(c.env.DB_lunar_attendance, c.req.param("id"));
  return c.redirect("/admin/wifi");
});

// ── Attendance Log ───────────────────────────────────────────────────
adminRoutes.get("/attendance", async (c) => {
  const records = await listAllAttendanceRecords(c.env.DB_lunar_attendance);
  return layout(
    c,
    "Attendance Log",
    "attendance",
    <>
      <div class="flex-between" style="margin-bottom: 1.5rem;">
        <h1 style="margin: 0;">Attendance Log</h1>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <div class="badge">LATEST 100 RECORDS</div>
          <a
            href="/admin/attendance/export"
            class="btn btn-secondary btn-icon"
            title="Export CSV"
          >
            <IconDownload />
          </a>
        </div>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Student</th>
              <th>Class</th>
              <th>Device</th>
              <th>Country</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr>
                <td>
                  <div class="font-semibold">{r.day}</div>
                  <div class="text-muted text-sm">{r.time}</div>
                </td>
                <td>
                  <div class="font-semibold">{r.studentName}</div>
                  <div class="text-muted text-sm">{r.studentId}</div>
                </td>
                <td>
                  <a
                    href={`/admin/classes/${r.classId}`}
                    class="badge badge-primary"
                    style="text-decoration: none;"
                  >
                    {r.classCode}
                  </a>
                </td>
                <td>
                  <span class="text-sm">{r.deviceType || "Unknown"}</span>
                </td>
                <td>
                  <span class="text-sm">{r.country || "Unknown"}</span>
                </td>
                <td style="text-align: right;">
                  <form
                    method="post"
                    action={`/admin/attendance/${r.id}/delete`}
                    onsubmit="return confirm('Delete this attendance record?')"
                  >
                    <button
                      class="btn btn-danger btn-icon"
                      title="Delete Record"
                    >
                      <IconTrash />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colspan={6}>
                  <div class="empty-state">
                    No attendance records found yet.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>,
  );
});
adminRoutes.post("/attendance/:id/delete", async (c) => {
  await deleteAttendanceRecord(c.env.DB_lunar_attendance, c.req.param("id"));
  return c.redirect("/admin/attendance");
});
adminRoutes.get("/attendance/export", async (c) => {
  const records = await listAllAttendanceRecordsForExport(
    c.env.DB_lunar_attendance,
  );
  const headers = [
    "Date",
    "Time",
    "Student Name",
    "Student ID",
    "Class Code",
    "IP Address",
    "Device",
    "Country",
    "Timezone",
  ];
  const rows = records.map((r) => [
    r.day,
    r.time,
    `"${r.studentName.replace(/"/g, '""')}"`,
    r.studentId,
    r.classCode,
    r.requesterIp || "",
    r.deviceType || "",
    r.country || "",
    r.clientTimezone || "",
  ]);
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
    "\n",
  );
  c.header("Content-Type", "text/csv");
  c.header(
    "Content-Disposition",
    'attachment; filename="attendance_export.csv"',
  );
  return c.body(csv);
});

// ── Today's Attendance (admin-scoped, all classes) ─────────────────────
// NOTE: This route lives inside adminRoutes so the browser sends the
// admin_session cookie (Path=/admin). Do NOT move it to a shared router.
adminRoutes.get("/attendance/today", async (c) => {
  const today = localDateKey();
  const records = await listAttendanceForDay(c.env.DB_lunar_attendance, today);

  const uniqueStudents = new Set(records.map((r) => r.studentId)).size;
  const uniqueClasses = new Set(records.map((r) => r.classId)).size;
  const totalCount = records.length;

  const searchScript = `
(function () {
  var input = document.getElementById('today-search');
  var countEl = document.getElementById('today-count');
  var rows = Array.from(document.querySelectorAll('#today-table tbody tr'));
  var total = rows.length;
  if (!input) return;
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var visible = 0;
    rows.forEach(function (row) {
      var text = (row.dataset.search || '').toLowerCase();
      var match = !q || text.includes(q);
      row.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (countEl) countEl.textContent = q
      ? visible + ' of ' + total + ' records'
      : total + ' record' + (total === 1 ? '' : 's');
  });
}());
`;

  return layout(
    c,
    "Today's Attendance",
    "today",
    <>
      <div style="margin-bottom: 2rem;">
        <div style="font-size: 0.72rem; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.4rem;">Live feed</div>
        <div class="flex-between" style="align-items: flex-start; gap: 1rem;">
          <div>
            <h1 style="margin: 0 0 0.4rem;">Today's Attendance</h1>
            <p class="text-muted" style="margin: 0; font-size: 0.9rem;">
              All student check-ins recorded today across every class.
            </p>
          </div>
          <span
            style="
              flex-shrink: 0; padding: 0.5rem 1.2rem;
              background: linear-gradient(135deg, var(--primary), #f59e0b);
              color: white; border-radius: 99px; font-size: 0.85rem;
              font-weight: 700; white-space: nowrap;
              box-shadow: 0 4px 12px rgba(217,119,6,0.3);
            "
          >
            {today}
          </span>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div class="grid" style="margin-bottom: 2rem;">
        <div class="stat-card">
          <div class="stat-label">Total Check-ins</div>
          <div class="stat-value">{totalCount}</div>
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

      {/* ── Search ── */}
      <div
        style="
          display: flex; align-items: center; gap: 0.75rem;
          background: white; border: 1px solid var(--line);
          border-radius: var(--rounded-xl); padding: 0 1rem;
          margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);
          transition: border-color 0.2s, box-shadow 0.2s;
        "
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--muted); flex-shrink:0;">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          id="today-search"
          type="search"
          placeholder="Search by student name or class code…"
          autocomplete="off"
          style="
            flex: 1; border: none; outline: none; background: transparent;
            padding: 0.85rem 0; font-family: inherit; font-size: 0.95rem;
            color: var(--ink);
          "
        />
        <span id="today-count" style="color: var(--muted); font-size: 0.78rem; font-weight: 700; white-space: nowrap; flex-shrink: 0;">
          {totalCount} record{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* ── Table or empty state ── */}
      {records.length === 0 ? (
        <div class="empty-state">
          No attendance check-ins recorded yet today. Start a class QR session to see records here.
        </div>
      ) : (
        <div class="table-container">
          <table id="today-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Student</th>
                <th>Class</th>
                <th>Device</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr data-search={`${r.studentName} ${r.classCode} ${r.className}`.toLowerCase()}>
                  <td>
                    <span
                      class="badge badge-primary"
                      style="font-variant-numeric: tabular-nums;"
                    >
                      {r.time}
                    </span>
                  </td>
                  <td>
                    <div class="font-semibold">{r.studentName}</div>
                    <div class="text-muted text-sm">{r.studentId}</div>
                  </td>
                  <td>
                    <a
                      href={`/admin/classes/${r.classId}`}
                      class="badge badge-primary"
                      style="text-decoration: none; margin-bottom: 0.2rem; display: inline-block;"
                    >
                      {r.classCode}
                    </a>
                    <div class="text-muted text-sm">{r.className}</div>
                  </td>
                  <td>
                    <span class="text-sm" style="text-transform: capitalize;">
                      {r.deviceType ?? "unknown"}
                    </span>
                  </td>
                  <td>{r.country ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <script dangerouslySetInnerHTML={{ __html: searchScript }} />
    </>,
  );
});
