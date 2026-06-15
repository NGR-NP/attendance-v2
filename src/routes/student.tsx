/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { Env } from "../types";
import { claimStudentAccessGrant } from "../lib/externalDummy";
import { rateLimit, requestIp } from "../lib/rateLimit";

export const studentRoutes = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

function boundedFormText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length <= maxLength ? text : "";
}

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
    text-align: center;
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
  }
  .eyebrow {
    color: var(--primary);
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  h1, h2 { margin: 0; line-height: 1.15; letter-spacing: 0; }
  h1 { font-size: 29px; font-weight: 900; }
  h2 { font-size: 24px; font-weight: 800; }
  p { margin: 10px 0 0; color: #475569; line-height: 1.62; font-weight: 500; }
  .helper { margin-top: 14px; font-size: 14px; }
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
    font-variant-numeric: tabular-nums;
  }
  .success { color: var(--success); }
  .error { color: var(--danger); }
  .status.success { background: #ecfdf5; border-color: #bbf7d0; color: var(--success); }
  .status.error { background: #fef2f2; border-color: #fecaca; color: var(--danger); }
  #msg.success { background: #ecfdf5; border-color: #bbf7d0; color: var(--success); }
  #msg.error { background: #fef2f2; border-color: #fecaca; color: var(--danger); }
  form { margin-top: 20px; }
  button {
    min-height: 44px;
    width: 100%;
    border: 0;
    border-radius: 0.85rem;
    background: var(--primary);
    color: white;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
`;

// ── Student access token claim ────────────────────────────────────
function studentAccessPage(
  c: AppContext,
  options: {
    token?: string;
    accessToken?: string;
    studentName?: string;
    error?: string;
  },
) {
  return c.html(
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Student Access</title>
        <style>{studentStyles}</style>
      </head>
      <body>
        <div class="panel">
          <div class="eyebrow">Student access</div>
          {options.accessToken ? (
            <>
              <h1>Access saved on this browser</h1>
              <div class="status success">Ready for attendance QRs</div>
              <p class="helper">
                {options.studentName}, this browser can now mark attendance for
                every class linked to your student account.
              </p>
              <script
                dangerouslySetInnerHTML={{
                  __html: `localStorage.setItem('access_token', ${JSON.stringify(options.accessToken)})`,
                }}
              />
            </>
          ) : options.token ? (
            <>
              <h1>Save access on this browser</h1>
              <p class="helper">
                Continue only on the device you will use to scan attendance QRs.
              </p>
              <form method="post" action="/student/access">
                <input type="hidden" name="token" value={options.token} />
                <button type="submit">Save student access</button>
              </form>
            </>
          ) : (
            <>
              <h1>Access could not be saved</h1>
              <div class="status error">{options.error}</div>
              <p class="helper">
                Ask your teacher for a fresh access QR if this one was already
                used or expired.
              </p>
            </>
          )}
        </div>
      </body>
    </html>,
  );
}

studentRoutes.get("/student/access", (c) => {
  const token = c.req.query("t") ?? c.req.query("token") ?? "";
  return studentAccessPage(
    c,
    token ? { token } : { error: "Access QR token missing" },
  );
});

studentRoutes.post("/student/access", async (c) => {
  const claimLimit = await rateLimit(
    c.env.KV_lunar_attendance,
    `student-access:${requestIp(c.req.raw)}`,
    10,
    5 * 60,
  );
  if (!claimLimit.allowed) {
    return studentAccessPage(c, {
      error: "Too many access attempts. Ask your teacher for help.",
    });
  }

  const body = await c.req.parseBody();
  const token = boundedFormText(body.token, 200);

  if (!token) {
    return studentAccessPage(c, { error: "Access QR token missing" });
  }

  try {
    const result = await claimStudentAccessGrant(
      c.env.DB_external_dummy,
      token,
    );

    if (result.ok) {
      return studentAccessPage(c, {
        accessToken: result.accessToken,
        studentName: result.student.name,
      });
    }

    return studentAccessPage(c, { error: result.error });
  } catch {
    return studentAccessPage(c, { error: "Could not reach access server" });
  }
});

// ── Attendance scan landing ────────────────────────────────────────
studentRoutes.get("/attend", (c) => {
  const sessionId = c.req.query("s") ?? "";
  const qrToken = c.req.query("q") ?? "";
  return c.html(
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>Mark Attendance</title>
        <style>{studentStyles}</style>
      </head>
      <body>
        <main class="panel">
          <div class="eyebrow">Scan</div>
          <h1>Checking attendance QR</h1>
          <p>Keep this page open until your attendance result appears.</p>
          <div id="msg" class="status">
            Submitting attendance...
          </div>
        </main>
        <script
          dangerouslySetInnerHTML={{
            __html: `
          const sessionId = ${JSON.stringify(sessionId)}
          const qrToken   = ${JSON.stringify(qrToken)}
          const accessToken = localStorage.getItem('access_token')
          const metadata = {
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            clientLanguage: navigator.language,
            clientPlatform: navigator.platform,
            screenSize: window.screen ? window.screen.width + 'x' + window.screen.height : undefined
          }

          const msg = document.getElementById('msg')

          if (!accessToken) {
            msg.textContent = 'No access token found. Scan the student access QR first.'
            msg.className = 'status error'
          } else {
            fetch('/api/attend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, qrToken, accessToken, metadata })
            })
            .then(r => r.json())
            .then(data => {
              if (data.nextAccessToken) {
                localStorage.setItem('access_token', data.nextAccessToken)
              }
              if (data.alreadyMarked) {
                msg.textContent = 'Already present: ' + data.studentName + ', you are marked for today.'
                msg.className = 'status success'
              } else if (data.ok) {
                msg.textContent = 'Present: ' + data.studentName + ', your attendance is saved.'
                msg.className = 'status success'
              } else {
                msg.textContent = data.error ?? 'Something went wrong'
                msg.className = 'status error'
                if ((data.error ?? '').toLowerCase().includes('access token')) {
                  localStorage.removeItem('access_token')
                }
              }
            })
            .catch(() => { msg.textContent = 'Network error'; msg.className = 'status error' })
          }
        `,
          }}
        />
      </body>
    </html>,
  );
});

// ── Student enrollment — get access token ─────────────────────────
studentRoutes.get("/student/enroll", async (c) => {
  const t = c.req.query("t") ?? "";
  if (t) return c.redirect(`/student/access?t=${encodeURIComponent(t)}`);

  return c.html(
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <title>Enrollment</title>
        <style>{studentStyles}</style>
      </head>
      <body>
        <main class="panel">
          <div class="eyebrow">Access</div>
          <h1>Enrollment moved</h1>
          <p>
            Student access now starts from the one-time QR on the teacher roster
            page. Scan that QR on the device you will use for attendance.
          </p>
        </main>
      </body>
    </html>,
  );
});
