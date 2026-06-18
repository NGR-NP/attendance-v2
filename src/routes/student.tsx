/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Env } from "../types";
import {
  createStudentWithContact,
  enrollStudentInClass,
  getClassFull,
  getStudentBySessionToken,
  createStudentSession,
} from "../lib/externalDummy";
import { verifyToken } from "../lib/token";
import { rateLimit, requestIp } from "../lib/rateLimit";

export const STUDENT_SESSION_COOKIE = "student_session";
export const studentRoutes = new Hono<{ Bindings: Env }>();

const studentStyles = `
  @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap");

  :root {
    color-scheme: light;
    --font-sans: "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --primary: lab(34.5327% 41.302 -79.0771);
    --primary-soft: color-mix(in srgb, var(--primary), white 90%);
    --primary-tint: color-mix(in srgb, var(--primary), white 78%);
    --ink: #0f172a;
    --muted: #64748b;
    --line: rgba(148, 163, 184, 0.28);
    --surface: rgba(255, 255, 255, 0.88);
    --success: #15803d;
    --danger: #b91c1c;
    --bg: #f8fafc;
  }
  * { box-sizing: border-box; }
  body {
    min-height: 100vh;
    margin: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    font-family: var(--font-sans);
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: var(--ink);
    background:
      radial-gradient(circle at 18% -12%, color-mix(in srgb, var(--primary), white 84%) 0, rgba(255,255,255,0) 30rem),
      linear-gradient(145deg, #fbfcff 0%, #f7f8ff 44%, #f8fafc 100%);
  }
  .panel {
    width: min(480px, 100%);
    border: 1px solid rgba(255, 255, 255, 0.82);
    border-radius: 2rem;
    padding: 30px;
    background: var(--surface);
    box-shadow: 0 22px 58px rgba(15, 23, 42, 0.1);
    outline: 1px solid var(--line);
    text-align: center;
  }
  .eyebrow {
    color: var(--primary);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  h1 { margin: 0; line-height: 1.15; letter-spacing: 0; font-size: 29px; font-weight: 900; }
  p { margin: 10px 0 0; color: #475569; line-height: 1.62; font-weight: 500; }
  
  .form-group {
    margin-top: 20px;
    text-align: left;
  }
  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--ink);
  }
  .form-group input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--line);
    border-radius: 0.85rem;
    font-family: inherit;
    font-size: 16px;
    background: white;
    transition: all 0.2s;
  }
  .form-group input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-soft);
  }
  
  .status {
    margin-top: 20px;
    padding: 14px 15px;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--primary), white 94%);
    border: 1px solid var(--primary-tint);
    color: var(--ink);
    font-size: 18px;
    font-weight: 800;
    line-height: 1.4;
    text-align: center;
  }
  .status.success { background: #ecfdf5; border-color: #bbf7d0; color: var(--success); }
  .status.error { background: #fef2f2; border-color: #fecaca; color: var(--danger); }
  
  button {
    margin-top: 24px;
    min-height: 48px;
    width: 100%;
    border: 0;
    border-radius: 0.85rem;
    background: var(--primary);
    color: white;
    font: inherit;
    font-size: 16px;
    font-weight: 900;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  button:hover { opacity: 0.9; }
`;

function RegistrationLayout({
  title,
  children,
}: {
  title: string;
  children: any;
}) {
  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: studentStyles }} />
      </head>
      <body>
        <div class="panel">{children}</div>
      </body>
    </html>
  );
}

// ── Student Registration & Login ────────────────────────────────────

studentRoutes.get("/register", async (c) => {
  const token = c.req.query("token") ?? c.req.query("t");
  if (!token) {
    return c.html(
      <RegistrationLayout title="Error">
        <div class="eyebrow">Error</div>
        <h1>Missing QR Token</h1>
        <p>Please scan a valid student onboarding or access QR code.</p>
      </RegistrationLayout>,
    );
  }

  const payload = await verifyToken(token, c.env.ADMIN_SECRET);
  if (!payload) {
    return c.html(
      <RegistrationLayout title="Expired QR">
        <div class="eyebrow">Error</div>
        <h1>QR Code Expired</h1>
        <div class="status error">Token is invalid or expired</div>
        <p>
          This QR code has expired or is invalid. Please ask your teacher for a
          new one.
        </p>
      </RegistrationLayout>,
    );
  }

  // Handle returning student directly logging in
  if (payload.type === "returning_student") {
    const { sessionId, expiresAt } = await createStudentSession(
      c.env.DB_lunar_attendance,
      payload.studentId,
    );
    setCookie(c, STUDENT_SESSION_COOKIE, sessionId, {
      path: "/",
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      expires: new Date(expiresAt * 1000),
    });

    return c.html(
      <RegistrationLayout title="Access Granted">
        <div class="eyebrow">Welcome Back</div>
        <h1>Device Authorized</h1>
        <div class="status success">Ready for Attendance</div>
        <p>
          Your session has been securely saved to this device. You can now use
          this device to scan the static attendance QR in class.
        </p>
      </RegistrationLayout>,
    );
  }

  // Handle new student registration form
  const cls = await getClassFull(c.env.DB_lunar_attendance, payload.classId);
  if (!cls) {
    return c.text("Class not found", 404);
  }

  return c.html(
    <RegistrationLayout title="Student Registration">
      <div class="eyebrow">New Student</div>
      <h1>Register for {cls.name}</h1>
      <p>Fill out your details to enroll in the class and link your device.</p>
      <form method="post" action="/register">
        <input type="hidden" name="token" value={token} />

        <div class="form-group">
          <label>Full Name</label>
          <input type="text" name="name" required placeholder="John Doe" />
        </div>

        <div class="form-group">
          <label>Email Address</label>
          <input
            type="email"
            name="email"
            required
            placeholder="john@example.com"
          />
        </div>

        <div class="form-group">
          <label>Contact Number</label>
          <input
            type="tel"
            name="contactNumber"
            required
            placeholder="+1 234 567 8900"
          />
        </div>

        <div class="form-group">
          <label>Secondary Contact (Optional)</label>
          <input
            type="tel"
            name="secondaryContact"
            placeholder="Parent or Guardian"
          />
        </div>

        <button type="submit">Complete Registration</button>
      </form>
    </RegistrationLayout>,
  );
});

studentRoutes.post("/register", async (c) => {
  const body = await c.req.parseBody<{
    token: string;
    name: string;
    email: string;
    contactNumber: string;
    secondaryContact: string;
  }>();

  if (!body.token) return c.text("Missing token", 400);

  const payload = await verifyToken(body.token, c.env.ADMIN_SECRET);
  if (!payload || payload.type !== "new_student") {
    return c.html(
      <RegistrationLayout title="Expired QR">
        <div class="eyebrow">Error</div>
        <h1>QR Code Expired</h1>
        <div class="status error">Token is invalid or expired</div>
        <p>Please ask your teacher for a new onboarding QR code.</p>
      </RegistrationLayout>,
    );
  }

  const { id: studentId } = await createStudentWithContact(
    c.env.DB_lunar_attendance,
    body.name,
    body.email,
    body.contactNumber,
    body.secondaryContact || "",
  );

  await enrollStudentInClass(
    c.env.DB_lunar_attendance,
    studentId,
    payload.classId,
  );

  const { sessionId, expiresAt } = await createStudentSession(
    c.env.DB_lunar_attendance,
    studentId,
  );
  setCookie(c, STUDENT_SESSION_COOKIE, sessionId, {
    path: "/",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    expires: new Date(expiresAt * 1000),
  });

  return c.html(
    <RegistrationLayout title="Registration Complete">
      <div class="eyebrow">Success</div>
      <h1>Registration Complete!</h1>
      <div class="status success">Device Linked</div>
      <p>
        Welcome, {body.name}. You are now enrolled and your device is ready to
        scan the attendance QR in class.
      </p>
    </RegistrationLayout>,
  );
});

// ── Deprecated local storage routes handling ──────────────────────

studentRoutes.get("/student/access", (c) => c.redirect("/register"));
studentRoutes.get("/student/enroll", (c) => c.redirect("/register"));

// ── Attendance scan landing ────────────────────────────────────────

studentRoutes.get("/attend", async (c) => {
  const sessionId = c.req.query("s") ?? "";

  // Verify standard cookie session instead of localStorage
  const sessionToken = getCookie(c, STUDENT_SESSION_COOKIE);
  const student = sessionToken
    ? await getStudentBySessionToken(c.env.DB_lunar_attendance, sessionToken)
    : null;

  return c.html(
    <RegistrationLayout title="Mark Attendance">
      <div class="eyebrow">Scan</div>
      <h1>Checking Attendance</h1>
      <p>Keep this page open until your attendance result appears.</p>
      <div id="msg" class="status">
        Submitting attendance...
      </div>
      <div id="actions" style="display: none; gap: 10px; margin-top: 20px;">
        <button id="btn-stay" style="background: var(--primary);">
          I will stay some more time
        </button>
        <button id="btn-checkout" style="background: var(--danger);">
          Checkout anyway
        </button>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
        const sessionId = ${JSON.stringify(sessionId)};
        const hasSession = ${JSON.stringify(!!student)};
        const msg = document.getElementById('msg');
        const actions = document.getElementById('actions');

        const metadata = {
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientLanguage: navigator.language,
          clientPlatform: navigator.platform,
          screenSize: window.screen ? window.screen.width + 'x' + window.screen.height : undefined
        };

        if (!hasSession) {
          msg.textContent = 'Session not found. Please scan the student access QR first to log in.';
          msg.className = 'status error';
        } else {
          function submitAttendance(checkoutAnyway = false) {
            msg.textContent = 'Submitting attendance...';
            msg.className = 'status';
            actions.style.display = 'none';

            fetch('/api/attend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, checkoutAnyway, metadata })
            })
            .then(r => r.json())
            .then(data => {
              if (data.warning) {
                msg.textContent = data.warning;
                msg.className = 'status error';
                actions.style.display = 'flex';
                
                document.getElementById('btn-stay').onclick = () => {
                  msg.textContent = 'Attendance preserved. You may close this page.';
                  msg.className = 'status success';
                  actions.style.display = 'none';
                };
                
                document.getElementById('btn-checkout').onclick = () => {
                  submitAttendance(true);
                };
              } else if (data.checkedOut) {
                msg.textContent = 'Checked out: ' + data.studentName + '. Have a good day!';
                msg.className = 'status success';
              } else if (data.alreadyMarked) {
                msg.textContent = 'Already marked present today: ' + data.studentName;
                msg.className = 'status success';
              } else if (data.ok) {
                msg.textContent = 'Present: ' + data.studentName + ', your attendance is saved.';
                msg.className = 'status success';
              } else {
                msg.textContent = data.error ?? 'Something went wrong';
                msg.className = 'status error';
              }
            })
            .catch(() => { msg.textContent = 'Network error'; msg.className = 'status error' });
          }
          
          submitAttendance();
        }
      `,
        }}
      />
    </RegistrationLayout>,
  );
});
