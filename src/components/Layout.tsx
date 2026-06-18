/** @jsxImportSource hono/jsx */

interface LayoutProps {
  title: string;
  role: "admin" | "teacher" | "student";
  userName?: string;
  adminActiveTab?:
    | "overview"
    | "teachers"
    | "students"
    | "classes"
    | "attendance"
    | "today"
    | string;
  teacherActiveTab?: "classes" | "today" | "global-qr" | string;
  qrScript?: boolean;
  backHref?: string;
  backLabel?: string;
  children: any;
}

export function Layout({
  title,
  role,
  userName,
  adminActiveTab,
  teacherActiveTab,
  qrScript = false,
  backHref,
  backLabel,
  children,
}: LayoutProps) {
  const bodyClass = `theme-${role}`;

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="stylesheet" href="/css/style.css" />
        {qrScript && (
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" />
        )}
      </head>
      <body class={bodyClass}>
        <div class="shell">
          <header class="topbar">
            <div class="topbar-inner">
              {role === "admin" ? (
                <a href="/admin" class="brand">
                  LUNAR <span class="brand-accent">ADMIN</span>
                </a>
              ) : role === "teacher" ? (
                <a href="/teacher/class" class="brand">
                  Attendance
                </a>
              ) : (
                <span class="brand">Attendance System</span>
              )}

              <div class="gap-2">
                {role === "admin" && (
                  <>
                    <div class="badge">INTERNAL TOOLS</div>
                    <a
                      href="/admin/logout"
                      class="btn btn-ghost"
                      style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
                    >
                      Logout
                    </a>
                  </>
                )}
                {role === "teacher" && userName && (
                  <div class="nav">
                    <span>{userName}</span>
                    <form
                      method="post"
                      action="/teacher/logout"
                      style="margin:0;"
                    >
                      <button
                        class="secondary"
                        type="submit"
                        style="min-height:30px; padding: 0 10px; font-size:12px;"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                )}
                {backHref && backLabel && (
                  <a href={backHref} class="btn-ghost">
                    {backLabel}
                  </a>
                )}
              </div>
            </div>
          </header>

          {/* Render navigation tabs */}
          {role === "admin" && (
            <nav class="tabs">
              <div class="tabs-inner">
                <a
                  href="/admin"
                  class={`tab ${adminActiveTab === "overview" ? "active" : ""}`}
                >
                  Overview
                </a>
                <a
                  href="/admin/teachers"
                  class={`tab ${adminActiveTab === "teachers" ? "active" : ""}`}
                >
                  Teachers
                </a>
                <a
                  href="/admin/students"
                  class={`tab ${adminActiveTab === "students" ? "active" : ""}`}
                >
                  Students
                </a>
                <a
                  href="/admin/classes"
                  class={`tab ${adminActiveTab === "classes" ? "active" : ""}`}
                >
                  Classes
                </a>
                <a
                  href="/admin/attendance"
                  class={`tab ${adminActiveTab === "attendance" ? "active" : ""}`}
                >
                  Attendance Log
                </a>
                <a
                  href="/attendance/today"
                  class={`tab ${adminActiveTab === "today" ? "active" : ""}`}
                >
                  Today's Attendance
                </a>
              </div>
            </nav>
          )}

          {role === "teacher" && (
            <nav class="tabs">
              <div class="tabs-inner">
                <a
                  href="/teacher/class"
                  class={`tab ${teacherActiveTab === "classes" ? "active" : ""}`}
                >
                  Classes Dashboard
                </a>
                <a
                  href="/attendance/today"
                  class={`tab ${teacherActiveTab === "today" ? "active" : ""}`}
                >
                  Today's Feed
                </a>
                <a
                  href="/teacher/attendance/main"
                  class={`tab ${teacherActiveTab === "global-qr" ? "active" : ""}`}
                >
                  Global QR Session
                </a>
              </div>
            </nav>
          )}

          <main class="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
