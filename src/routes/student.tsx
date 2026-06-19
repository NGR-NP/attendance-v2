/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Env } from "../types";
import {
  createStudentWithContact,
  enrollStudentInClass,
  getClassFull,
  getStudentBySessionToken,
  createStudentSession,
  listStudentEnrolledClassesForTeacher,
} from "../lib/externalDummy";
import { verifyToken } from "../lib/token";
import { Layout } from "../components/Layout";

export const STUDENT_SESSION_COOKIE = "student_session";
export const studentRoutes = new Hono<{ Bindings: Env }>();

type AppContext = Context<{ Bindings: Env }>;

function layout(
  c: AppContext,
  title: string,
  children: any,
) {
  return c.html(
    <Layout role="student" title={title}>
      <div class="panel" style="margin: 2rem auto;">
        {children}
      </div>
    </Layout>,
  );
}

// ── Student Registration & Login ────────────────────────────────────

studentRoutes.get("/register", async (c) => {
  const token = c.req.query("token") ?? c.req.query("t");
  if (!token) {
    return layout(
      c,
      "Error",
      <>
        <div class="eyebrow">Error</div>
        <h1>Missing QR Token</h1>
        <p>Please scan a valid student onboarding or access QR code.</p>
      </>,
    );
  }

  const payload = await verifyToken(token, c.env.ADMIN_SECRET);
  if (!payload) {
    return layout(
      c,
      "Expired QR",
      <>
        <div class="eyebrow">Error</div>
        <h1>QR Code Expired</h1>
        <div class="status error">Token is invalid or expired</div>
        <p>
          This QR code has expired or is invalid. Please ask your teacher for a
          new one.
        </p>
      </>,
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

    return layout(
      c,
      "Access Granted",
      <>
        <div class="eyebrow">Welcome Back</div>
        <h1>Device Authorized</h1>
        <div class="status success">Ready for Attendance</div>
        <p>
          Your session has been securely saved to this device. You can now use
          this device to scan the static attendance QR in class.
        </p>
      </>,
    );
  }

  // Handle new student registration form
  const cls = await getClassFull(c.env.DB_lunar_attendance, payload.classId);
  if (!cls) {
    return c.text("Class not found", 404);
  }

  return layout(
    c,
    "Student Registration",
    <>
      <div class="eyebrow">New Student</div>
      <h1>Register for {cls.name}</h1>
      <p>Fill out your details to enroll in the class and link your device.</p>
      <form method="post" action="/register">
        <input type="hidden" name="token" value={token} />
        <div class="form-stack">
          <div class="field">
            <label>Full Name</label>
            <input type="text" name="name" required placeholder="John Doe" />
          </div>

          <div class="field">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              required
              placeholder="john@example.com"
            />
          </div>

          <div class="field">
            <label>Contact Number</label>
            <input
              type="tel"
              name="contactNumber"
              required
              placeholder="+1 234 567 8900"
            />
          </div>

          <div class="field">
            <label>Secondary Contact (Optional)</label>
            <input
              type="tel"
              name="secondaryContact"
              placeholder="Parent or Guardian"
            />
          </div>

          <button type="submit">Complete Registration</button>
        </div>
      </form>
    </>,
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
    return layout(
      c,
      "Expired QR",
      <>
        <div class="eyebrow">Error</div>
        <h1>QR Code Expired</h1>
        <div class="status error">Token is invalid or expired</div>
        <p>Please ask your teacher for a new onboarding QR code.</p>
      </>,
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

  return layout(
    c,
    "Registration Complete",
    <>
      <div class="eyebrow">Success</div>
      <h1>Registration Complete!</h1>
      <div class="status success">Device Linked</div>
      <p>
        Welcome, {body.name}. You are now enrolled and your device is ready to
        scan the attendance QR in class.
      </p>
    </>,
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

  // Load the session and check its class_id
  const session = await c.env.DB_lunar_attendance.prepare(
    `SELECT class_id, teacher_id, status FROM sessions WHERE id = ? LIMIT 1`,
  )
    .bind(sessionId)
    .first<{
      class_id: string;
      teacher_id: string;
      status: string;
    }>();

  let isMainQr = true;
  let enrolledClasses: any[] = [];
  let isNotEnrolled = false;

  if (session && session.status === "active") {
    if (session.class_id === "__all__") {
      isMainQr = true;
      if (student) {
        enrolledClasses = await listStudentEnrolledClassesForTeacher(
          c.env.DB_lunar_attendance,
          student.id,
          session.teacher_id,
        );
        if (enrolledClasses.length === 0) {
          isNotEnrolled = true;
        }
      }
    }
  }

  return layout(
    c,
    "Mark Attendance",
    <>
      <div class="eyebrow">Scan</div>
      <h1>Checking Attendance</h1>
      <p>Keep this page open until your attendance result appears.</p>

      {isNotEnrolled ? (
        <div id="msg" class="status error">
          You are not enrolled in any classes taught by this teacher.
        </div>
      ) : (
        <>
          {isMainQr && student && enrolledClasses.length > 1 ? (
            <div id="class-selection-container" style="margin-top: 20px; text-align: left;">
              <div class="form-stack">
                <div class="field">
                  <label>Select your class:</label>
                  <select id="class-select" style="width: 100%;">
                    {enrolledClasses.map(cls => (
                      <option value={cls.id}>{cls.name} ({cls.code})</option>
                    ))}
                  </select>
                </div>
                <button id="btn-confirm-class">Confirm Check-in</button>
              </div>
            </div>
          ) : null}

          <div id="msg" class="status">
            {isMainQr && student && enrolledClasses.length > 1 ? "Please select a class above to continue." : "Submitting attendance..."}
          </div>
        </>
      )}

      <div id="actions" style="display: none; gap: 10px; margin-top: 20px;">
        <button id="btn-stay">
          I will stay some more time
        </button>
        <button id="btn-checkout" class="danger">
          Checkout anyway
        </button>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
        const sessionId = ${JSON.stringify(sessionId)};
        const hasSession = ${JSON.stringify(!!student)};
        const enrolledClasses = ${JSON.stringify(enrolledClasses)};
        const isMainQr = ${JSON.stringify(isMainQr)};
        const isNotEnrolled = ${JSON.stringify(isNotEnrolled)};
        const msg = document.getElementById('msg');
        const actions = document.getElementById('actions');

        function showMessage(text, type) {
          if (!msg) return;
          msg.textContent = text;
          msg.className = 'status' + (type ? ' ' + type : '');
          msg.classList.remove('toast');
          void msg.offsetWidth;
          msg.classList.add('toast');
        }

        const metadata = {
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientLanguage: navigator.language,
          clientPlatform: navigator.platform,
          screenSize: window.screen ? window.screen.width + 'x' + window.screen.height : undefined
        };

        if (isNotEnrolled) {
          // Message already rendered on server side
        } else if (!hasSession) {
          msg.textContent = 'Session not found. Please scan the student access QR first to log in.';
          msg.className = 'status error';
        } else {
          function submitAttendance(classId = null, checkoutAnyway = false) {
            msg.textContent = 'Submitting attendance...';
            msg.className = 'status';
            actions.style.display = 'none';

            fetch('/api/attend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, classId, checkoutAnyway, metadata })
            })
            .then(r => r.json())
            .then(data => {
              if (data.warning) {
                showMessage(data.warning, 'error');
                actions.style.display = 'flex';
                
                document.getElementById('btn-stay').onclick = () => {
                  showMessage('Attendance preserved. You may close this page.', 'success');
                  actions.style.display = 'none';
                };
                
                document.getElementById('btn-checkout').onclick = () => {
                  submitAttendance(classId, true);
                };
              } else if (data.checkedOut) {
                showMessage('Checked out: ' + data.studentName + '. Have a good day!', 'success');
                const selectContainer = document.getElementById('class-selection-container');
                if (selectContainer) selectContainer.style.display = 'none';
                actions.style.display = 'none';
              } else if (data.alreadyMarked) {
                showMessage('Already marked present today: ' + data.studentName, 'success');
                const selectContainer = document.getElementById('class-selection-container');
                if (selectContainer) selectContainer.style.display = 'none';
                actions.style.display = 'none';
              } else if (data.ok) {
                showMessage('Present: ' + data.studentName + ', your attendance is saved.', 'success');
                const selectContainer = document.getElementById('class-selection-container');
                if (selectContainer) selectContainer.style.display = 'none';
                actions.style.display = 'none';
              } else {
                showMessage(data.error ?? 'Something went wrong', 'error');
              }
            })
            .catch(() => { showMessage('Network error', 'error'); });
          }
          
          if (isMainQr) {
            if (enrolledClasses.length === 1) {
              submitAttendance(enrolledClasses[0].id);
            } else if (enrolledClasses.length > 1) {
              document.getElementById('btn-confirm-class').onclick = () => {
                const selectedClassId = document.getElementById('class-select').value;
                submitAttendance(selectedClassId);
              };
            }
          } else {
            submitAttendance();
          }
        }
      `,
        }}
      />
    </>,
  );
});
