import { Hono } from "hono";
import type { Context } from "hono";
import { Env } from "../types";
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
} from "../lib/externalDummy";
export const adminRoutes = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;
// ── Auth helpers ─────────────────────────────────────────────────────
const COOKIE_NAME = "admin_session";
async function signToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = "admin:authenticated";
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payload}.${hex}`;
}
async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const [payload, hex] = token.split(".");
    if (!payload || !hex) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = new Uint8Array(
      hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );
    return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
  } catch {
    return false;
  }
}
function getCookie(c: AppContext, name: string): string | undefined {
  const header = c.req.header("Cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
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
  const token = getCookie(c, COOKIE_NAME);
  if (token && (await verifyToken(token, c.env.ADMIN_SECRET))) {
    return c.redirect("/admin");
  }
  return loginPage(c);
});
adminRoutes.post("/login", async (c) => {
  const { secret } = await c.req.parseBody<{ secret: string }>();
  if (secret !== c.env.ADMIN_SECRET) {
    return loginPage(c, "Invalid secret. Please try again.");
  }
  const token = await signToken(c.env.ADMIN_SECRET);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin",
      "Set-Cookie": `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=86400`,
    },
  });
});
adminRoutes.get("/logout", async (c) => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/login",
      "Set-Cookie": `${COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
});
// ── Auth middleware (protects all routes below) ──────────────────────
adminRoutes.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/admin/login") return next();
  const token = getCookie(c, COOKIE_NAME);
  if (!token || !(await verifyToken(token, c.env.ADMIN_SECRET))) {
    return c.redirect("/admin/login");
  }
  await next();
});
const adminStyles = `
  @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap");
  :root {
    color-scheme: light;
    --font-sans: "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --primary: #d97706; /* Richer Amber */
    --primary-soft: #fef3c7;
    --primary-hover: #b45309;
    --ink: #0f172a;
    --ink-light: #334155;
    --muted: #64748b;
    --bg: #f8fafc;
    --surface: #ffffff;
    --line: #e2e8f0;
    --success: #10b981;
    --danger: #ef4444;
    --danger-soft: #fee2e2;
    --danger-hover: #dc2626;
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-md: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --rounded-lg: 0.75rem;
    --rounded-xl: 1rem;
    --rounded-2xl: 1.5rem;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  /* Header & Navigation */
  .topbar {
    position: sticky; top: 0; z-index: 50;
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(226, 232, 240, 0.8);
    padding: 1rem 2rem;
  }
  .topbar-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
  .brand { 
    font-weight: 800; font-size: 1.25rem; color: var(--ink); text-decoration: none; 
    display: flex; align-items: center; gap: 0.5rem; letter-spacing: -0.02em;
  }
  .brand-accent { color: var(--primary); }
  .tabs {
    background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line);
    position: sticky; top: 61px; z-index: 40;
  }
  .tabs-inner { max-width: 1200px; margin: 0 auto; display: flex; gap: 2.5rem; padding: 0 2rem; }
  .tab {
    padding: 1.25rem 0; color: var(--muted); font-weight: 600; text-decoration: none; font-size: 0.95rem;
    border-bottom: 2px solid transparent; transition: all 0.2s ease; position: relative;
  }
  .tab:hover { color: var(--ink); }
  .tab.active { color: var(--primary); }
  .tab.active::after {
    content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px;
    background: var(--primary); border-radius: 2px 2px 0 0;
  }
  .main { max-width: 1200px; margin: 3rem auto; padding: 0 2rem 5rem; }
  
  /* Cards */
  .card {
    background: var(--surface); border-radius: var(--rounded-xl); padding: 2rem;
    box-shadow: var(--shadow-sm); border: 1px solid var(--line); margin-bottom: 2rem;
    transition: box-shadow 0.3s ease, transform 0.3s ease;
  }
  .card-interactive:hover {
    box-shadow: var(--shadow-md); transform: translateY(-2px); border-color: #cbd5e1;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; }
  /* Typography */
  h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 2rem 0; color: var(--ink); }
  h2 { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 1rem 0; color: var(--ink); }
  
  .text-muted { color: var(--muted); }
  .text-sm { font-size: 0.875rem; }
  .font-semibold { font-weight: 600; }
  /* Forms */
  .inline-form { 
    display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 2rem; flex-wrap: wrap; 
    background: #fdfdfd; padding: 1.5rem; border-radius: var(--rounded-xl); border: 1px solid var(--line);
    box-shadow: var(--shadow-sm);
  }
  .field { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-width: 200px; }
  .field label { font-size: 0.8rem; font-weight: 700; color: var(--ink-light); text-transform: uppercase; letter-spacing: 0.05em; }
  input {
    padding: 0.75rem 1rem; border: 1px solid var(--line); border-radius: var(--rounded-lg);
    font-family: inherit; font-size: 0.95rem; outline: none; transition: all 0.2s ease;
    background: var(--bg); color: var(--ink);
  }
  input:hover { border-color: #cbd5e1; }
  input:focus { border-color: var(--primary); background: white; box-shadow: 0 0 0 3px var(--primary-soft); }
  /* Buttons */
  button, .btn {
    padding: 0.75rem 1.5rem; border-radius: var(--rounded-lg); font-weight: 600; font-size: 0.9rem;
    cursor: pointer; border: 1px solid transparent; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); font-family: inherit;
    display: inline-flex; align-items: center; justify-content: center; text-decoration: none; gap: 0.5rem;
  }
  .btn-primary { background: var(--primary); color: white; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.2); }
  .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 4px 6px rgba(217, 119, 6, 0.3); }
  .btn-primary:active { transform: translateY(0); }
  
  .btn-secondary { background: var(--bg); border: 1px solid var(--line); color: var(--ink); }
  .btn-secondary:hover { background: #f1f5f9; border-color: #cbd5e1; }
  
  .btn-danger { background: var(--surface); border: 1px solid var(--danger-soft); color: var(--danger); }
  .btn-danger:hover { background: var(--danger-soft); border-color: #fca5a5; }
  .btn-ghost { color: var(--muted); background: transparent; }
  .btn-ghost:hover { background: var(--bg); color: var(--ink); }
  
  .btn-icon { padding: 0.6rem; border-radius: 0.5rem; line-height: 0; }
  /* Tables */
  .table-container {
    background: white; border-radius: var(--rounded-xl); border: 1px solid var(--line);
    overflow: hidden; box-shadow: var(--shadow-sm); margin-bottom: 2rem;
  }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th { 
    font-size: 0.75rem; font-weight: 700; color: var(--muted); text-transform: uppercase; 
    padding: 1rem 1.5rem; border-bottom: 1px solid var(--line); background: #f8fafc; letter-spacing: 0.05em;
  }
  td { padding: 1rem 1.5rem; border-bottom: 1px solid var(--line); font-size: 0.95rem; vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  tbody tr { transition: background-color 0.2s; }
  tbody tr:hover { background-color: #f1f5f9; }
  /* Badges */
  .badge { 
    padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.75rem; font-weight: 700; 
    background: var(--bg); color: var(--ink-light); border: 1px solid var(--line); display: inline-block;
  }
  .badge-primary { background: var(--primary-soft); color: var(--primary-hover); border-color: transparent; }
  /* Lists */
  .class-split { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
  @media (max-width: 900px) { .class-split { grid-template-columns: 1fr; } }
  .scroll-box { max-height: 450px; overflow-y: auto; margin: -1rem; padding: 1rem; }
  /* Custom Scrollbar for scroll-box */
  .scroll-box::-webkit-scrollbar { width: 6px; }
  .scroll-box::-webkit-scrollbar-track { background: transparent; }
  .scroll-box::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
  .scroll-box::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  .list-item { 
    display: flex; align-items: center; justify-content: space-between; 
    padding: 1rem; border-radius: var(--rounded-lg); border: 1px solid var(--line);
    margin-bottom: 0.5rem; background: white; transition: all 0.2s ease;
  }
  .list-item:hover { border-color: #cbd5e1; box-shadow: var(--shadow-sm); }
  .list-item:last-child { margin-bottom: 0; }
  .item-info { display: flex; flex-direction: column; gap: 0.25rem; }
  .item-name { font-weight: 600; font-size: 0.95rem; color: var(--ink); }
  .item-email { font-size: 0.85rem; color: var(--muted); }
  
  /* Stat Cards */
  .stat-card {
    background: white; border-radius: var(--rounded-xl); padding: 2rem;
    border: 1px solid var(--line); display: flex; flex-direction: column;
    position: relative; overflow: hidden; box-shadow: var(--shadow-sm);
  }
  .stat-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, var(--primary), #fcd34d);
    opacity: 0.8;
  }
  .stat-label { font-size: 0.85rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .stat-value { font-size: 3.5rem; font-weight: 800; color: var(--ink); line-height: 1; letter-spacing: -0.02em; margin-bottom: 1.5rem; }
  
  /* Utilities */
  .flex-between { display: flex; justify-content: space-between; align-items: center; }
  .gap-2 { gap: 0.5rem; display: flex; align-items: center; }
  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--muted); background: var(--bg); border-radius: var(--rounded-lg); border: 1px dashed #cbd5e1; }
`;
function layout(
  c: AppContext,
  title: string,
  activeTab: string,
  children: any,
) {
  return c.html(
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} - Admin</title>
        <style>{adminStyles}</style>
      </head>
      <body>
        <header class="topbar">
          <div class="topbar-inner">
            <a href="/admin" class="brand">
              LUNAR <span class="brand-accent">ADMIN</span>
            </a>
            <div class="gap-2">
              <div class="badge">INTERNAL TOOLS</div>
              <a
                href="/admin/logout"
                class="btn btn-ghost"
                style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
              >
                Logout
              </a>
            </div>
          </div>
        </header>
        <nav class="tabs">
          <div class="tabs-inner">
            <a
              href="/admin"
              class={`tab ${activeTab === "overview" ? "active" : ""}`}
            >
              Overview
            </a>
            <a
              href="/admin/teachers"
              class={`tab ${activeTab === "teachers" ? "active" : ""}`}
            >
              Teachers
            </a>
            <a
              href="/admin/students"
              class={`tab ${activeTab === "students" ? "active" : ""}`}
            >
              Students
            </a>
            <a
              href="/admin/classes"
              class={`tab ${activeTab === "classes" ? "active" : ""}`}
            >
              Classes
            </a>
            <a
              href="/admin/attendance"
              class={`tab ${activeTab === "attendance" ? "active" : ""}`}
            >
              Attendance
            </a>
          </div>
        </nav>
        <main class="main">{children}</main>
      </body>
    </html>,
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
  const enrolled = await listEnrolledStudents(c.env.DB_lunar_attendance, classId);
  const unenrolled = await listUnenrolledStudents(
    c.env.DB_lunar_attendance,
    classId,
  );
  const assigned = await listAssignedTeachers(c.env.DB_lunar_attendance, classId);
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
          <a href={`/admin/classes/${classId}/onboarding`} class="btn btn-primary">
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
      c.env.ADMIN_SECRET
    )
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
        <p>Scan this QR to register and enroll in <strong>{cls.name}</strong></p>
        <div style="background: white; padding: 1rem; display: inline-block; border-radius: 8px;">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`} alt="Onboarding QR" />
        </div>
        <p class="text-muted" style="margin-top: 1rem; word-break: break-all;">
          <a href={url} target="_blank">{url}</a>
        </p>
      </div>
    </>
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
