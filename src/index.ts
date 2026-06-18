/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { Env } from "./types";
import { teacherRoutes } from "./routes/teacher";
import { studentRoutes, STUDENT_SESSION_COOKIE } from "./routes/student";
import { adminRoutes } from "./routes/admin";
import { todayAttendanceRoutes } from "./routes/todayAttendance";
import {
  AttendanceScanMetadata,
  claimStudentAccessGrant,
  getTeacherBySessionToken,
  isTeacherPinRecentlyVerified,
  markExternalAttendance,
  rotateStudentAccessToken,
  TEACHER_SESSION_COOKIE,
  teacherCanAccessClass,
  verifyStudentAccessForClass,
  getStudentBySessionToken,
  touchStudentSession,
  getClassById,
} from "./lib/externalDummy";
import { localDateKey, SQLITE_LOCALTIME_MODIFIER } from "./lib/date";
import { rateLimit, requestIp } from "./lib/rateLimit";

export { AttendanceSession as lunarAttendance } from "./do/AttendanceSession";

const app = new Hono<{ Bindings: Env }>();

function safeText(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function deviceTypeFromUserAgent(userAgent: string | undefined) {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet|kindle|silk/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "mobile";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "unknown";
}

function reasonableText(
  value: string | undefined,
  maxLength: number,
): value is string {
  return Boolean(value && value.length <= maxLength);
}

function requestScanMetadata(
  req: Request,
  clientMetadata?: AttendanceScanMetadata,
): AttendanceScanMetadata {
  const headers = req.headers;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = safeText(headers.get("user-agent") ?? undefined, 500);
  const screenSize = safeText(clientMetadata?.screenSize, 32);

  return {
    requesterIp: safeText(
      headers.get("cf-connecting-ip") ??
        headers.get("x-real-ip") ??
        forwardedFor ??
        undefined,
      64,
    ),
    userAgent,
    deviceType: deviceTypeFromUserAgent(userAgent),
    country: safeText(headers.get("cf-ipcountry") ?? undefined, 2),
    clientTimezone: safeText(clientMetadata?.clientTimezone, 64),
    clientLanguage: safeText(clientMetadata?.clientLanguage, 32),
    clientPlatform: safeText(clientMetadata?.clientPlatform, 80),
    screenSize: /^\d{2,5}x\d{2,5}$/.test(screenSize ?? "")
      ? screenSize
      : undefined,
  };
}

function externalApiAuthorized(c: {
  env: Env;
  req: { header: (name: string) => string | undefined };
}) {
  const secret = c.env.EXTERNAL_API_SECRET;
  if (!secret) return true; // TODO: remove this line after debugging, and handle error appropriately
  const auth = c.req.header("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  return bearer === secret || c.req.header("x-api-key") === secret;
}

function setSecurityHeaders(c: any) {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  if (new URL(c.req.url).protocol === "https:") {
    c.header(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  }
}
function sameOriginRequest(c: any) {
  const method = c.req.method.toUpperCase();

  // Only protect state-changing requests
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return true;
  }

  const origin = c.req.header("origin");
  const secFetchSite = c.req.header("sec-fetch-site");
  const hostOrigin = new URL(c.req.url).origin;

  // Allowed origins:
  // 1. Current domain
  // 2. attendance.example.com
  // 3. sms.webapp.com
  const allowedOrigins = new Set([
    hostOrigin,
    "https://attendance.tejbahadurkarki.name.np",
    "https://attendance.localsearch.world",
  ]);

  // If browser explicitly says request is cross-site, block unless origin is allowed
  if (secFetchSite === "cross-site") {
    if (!origin || !allowedOrigins.has(origin)) {
      return false;
    }
  }

  // If Origin header exists, it must be in the allowlist
  if (origin) {
    return allowedOrigins.has(origin);
  }

  // Requests without Origin header (e.g. curl, mobile apps) are allowed
  return true;
}
// function sameOriginRequest(c: any) {
//   const method = c.req.method.toUpperCase();
//   if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
//   const origin = c.req.header("origin");
//   const secFetchSite = c.req.header("sec-fetch-site");
//   if (secFetchSite && ["cross-site", "same-site"].includes(secFetchSite)) {
//     return false;
//   }
//   if (!origin) return true;
//   return origin === new URL(c.req.url).origin;
// }

async function requireRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  return rateLimit(kv, key, limit, windowSeconds);
}

app.use("*", async (c, next) => {
  if (!sameOriginRequest(c)) {
    return c.text("Forbidden", 403);
  }
  await next();
  setSecurityHeaders(c);
});

app.route("/teacher", teacherRoutes);
app.route("/admin", adminRoutes);
app.route("/attendance", todayAttendanceRoutes);
app.route("/", studentRoutes);

// External dummy API backed by DB_lunar_attendance.
app.post("/external/dev/setup", async (c) => {
  if (!externalApiAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
  const setupLimit = await requireRateLimit(
    c.env.KV_lunar_attendance,
    `external-setup:${requestIp(c.req.raw)}`,
    5,
    5 * 60,
  );
  if (!setupLimit.allowed) return c.json({ error: "Too many requests" }, 429);
  return c.json({ ok: true });
});

app.post("/external/student/access/claim", async (c) => {
  if (!externalApiAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
  const claimLimit = await requireRateLimit(
    c.env.KV_lunar_attendance,
    `external-access-claim:${requestIp(c.req.raw)}`,
    30,
    5 * 60,
  );
  if (!claimLimit.allowed) return c.json({ error: "Too many requests" }, 429);
  const { token } = await c.req.json<{ token?: string }>();
  if (!reasonableText(token, 200))
    return c.json({ ok: false, error: "Missing access QR token" }, 400);

  const result = await claimStudentAccessGrant(
    c.env.DB_lunar_attendance,
    token,
  );
  if (!result.ok) return c.json(result, 400);

  return c.json({
    ok: true,
    accessToken: result.accessToken,
    student: result.student,
  });
});

app.post("/external/attendance/mark", async (c) => {
  if (!externalApiAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
  const markLimit = await requireRateLimit(
    c.env.KV_lunar_attendance,
    `external-attendance-mark:${requestIp(c.req.raw)}`,
    60,
    60,
  );
  if (!markLimit.allowed) return c.json({ error: "Too many requests" }, 429);
  const { accessToken, classId, sessionId, attendanceDay, metadata } =
    await c.req.json<{
      accessToken?: string;
      classId?: string;
      sessionId?: string;
      attendanceDay?: string;
      metadata?: AttendanceScanMetadata;
    }>();
  if (!reasonableText(accessToken, 240)) {
    return c.json({ message: "Missing access token" }, 401);
  }
  if (!reasonableText(classId, 80)) {
    return c.json({ message: "Missing class ID" }, 400);
  }
  if (!reasonableText(sessionId, 120)) {
    return c.json({ message: "Missing session ID" }, 400);
  }
  if (!reasonableText(attendanceDay, 24)) {
    return c.json({ message: "Missing attendance day" }, 400);
  }

  const student = await verifyStudentAccessForClass(
    c.env.DB_lunar_attendance,
    accessToken,
    classId,
  );
  if (!student) {
    return c.json({ message: "Student is not enrolled in this class" }, 401);
  }

  const result = await markExternalAttendance(c.env.DB_lunar_attendance, {
    sessionId,
    classId,
    studentId: student.studentId,
    studentName: student.studentName,
    attendanceDay,
    metadata: requestScanMetadata(c.req.raw, metadata),
  });
  const rotated = await rotateStudentAccessToken(
    c.env.DB_lunar_attendance,
    accessToken,
    student.studentId,
  );
  if (!rotated) {
    return c.json({ message: "Access token expired" }, 401);
  }

  return c.json({
    ...result,
    studentId: student.studentId,
    classId,
    nextAccessToken: rotated.accessToken,
  });
});

// Forward WebSocket upgrade to DO
app.get("/api/sessions/:id/ws", async (c) => {
  const teacher = await getTeacherBySessionToken(
    c.env.DB_lunar_attendance,
    getCookie(c, TEACHER_SESSION_COOKIE),
  );
  if (!teacher) {
    return c.json({ error: "Teacher login required" }, 401);
  }

  const sessionId = c.req.param("id");
  const session = await c.env.DB_lunar_attendance.prepare(
    `SELECT id
       FROM sessions
      WHERE id = ?
        AND teacher_id = ?
      LIMIT 1`,
  )
    .bind(sessionId, teacher.id)
    .first<{ id: string }>();
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const doId = c.env.durable_objects_lunar_attendance.idFromName(sessionId);
  const stub = c.env.durable_objects_lunar_attendance.get(doId);
  return stub.fetch(new Request(`https://do-internal/ws`, c.req.raw));
});

// Student submits attendance
app.post("/api/attend", async (c) => {
  console.log(requestIp(c.req.raw));
  const attendLimit = await requireRateLimit(
    c.env.KV_lunar_attendance,
    `attend:${requestIp(c.req.raw)}`,
    30,
    60,
  );
  if (!attendLimit.allowed) {
    return c.json({ error: "Too many attendance attempts" }, 429);
  }

  const sessionToken = getCookie(c, STUDENT_SESSION_COOKIE);
  if (!sessionToken) return c.json({ error: "Session required" }, 401);
  const student = await getStudentBySessionToken(
    c.env.DB_lunar_attendance,
    sessionToken,
  );
  if (!student) return c.json({ error: "Invalid session" }, 401);

  const body = await c.req.json<{
    sessionId: string;
    classId?: string;
    checkoutAnyway?: boolean;
    metadata?: AttendanceScanMetadata;
  }>();

  if (!reasonableText(body.sessionId, 120)) {
    return c.json({ error: "Missing session ID" }, 400);
  }

  const session = await c.env.DB_lunar_attendance.prepare(
    `SELECT class_id, teacher_id, ip_address, status FROM sessions WHERE id = ? LIMIT 1`,
  )
    .bind(body.sessionId)
    .first<{
      class_id: string;
      teacher_id: string;
      ip_address: string;
      status: string;
    }>();

  if (!session || session.status !== "active") {
    return c.json({ error: "Invalid or inactive session" }, 400);
  }

  // IP verification
  const studentIp = requestIp(c.req.raw);
  if (
    session.ip_address &&
    session.ip_address !== studentIp &&
    session.ip_address !== "unknown" &&
    studentIp !== "unknown"
  ) {
    // Basic IP match check. In local dev, IPs might be unknown.
    return c.json({ error: "Please connect to the class Wi-Fi network" }, 403);
  }

  let targetClassId = session.class_id;
  if (session.class_id === "__all__") {
    if (!body.classId) {
      return c.json({ error: "Class selection required" }, 400);
    }
    targetClassId = body.classId;

    // Check teacher assignment
    const isTeacherAssigned = await c.env.DB_lunar_attendance.prepare(
      `SELECT 1 FROM teacher_classes WHERE teacher_id = ? AND class_id = ?`,
    )
      .bind(session.teacher_id, targetClassId)
      .first();

    if (!isTeacherAssigned) {
      return c.json({ error: "Teacher is not assigned to the selected class" }, 403);
    }
  }

  // Check enrollment
  const isEnrolled = await c.env.DB_lunar_attendance.prepare(
    `SELECT 1 FROM student_classes WHERE student_id = ? AND class_id = ?`,
  )
    .bind(student.id, targetClassId)
    .first();

  if (!isEnrolled) {
    return c.json({ error: "Not enrolled in this class" }, 403);
  }

  await touchStudentSession(c.env.DB_lunar_attendance, sessionToken);

  const attendanceDay = localDateKey();
  const existingRecord = await c.env.DB_lunar_attendance.prepare(
    `SELECT id, attended_at, checked_out_at FROM attendance_records WHERE class_id = ? AND student_id = ? AND attendance_day = ? LIMIT 1`,
  )
    .bind(targetClassId, student.id, attendanceDay)
    .first<{
      id: string;
      attended_at: number;
      checked_out_at: number | null;
    }>();

  let alreadyMarked = false;
  let checkedOut = false;

  if (existingRecord) {
    const hoursSinceMark =
      (Math.floor(Date.now() / 1000) - existingRecord.attended_at) / 3600;
    if (existingRecord.checked_out_at) {
      alreadyMarked = true;
      checkedOut = true;
    } else if (hoursSinceMark < 2 && !body.checkoutAnyway) {
      const minutesSpent = Math.floor(hoursSinceMark * 60);
      return c.json({
        warning: `You have spent ${minutesSpent} minutes in class. Do you want to check out?`,
      });
    } else if (body.checkoutAnyway || hoursSinceMark >= 2) {
      await c.env.DB_lunar_attendance.prepare(
        `UPDATE attendance_records SET checked_out_at = ? WHERE id = ?`,
      )
        .bind(Math.floor(Date.now() / 1000), existingRecord.id)
        .run();
      checkedOut = true;
    } else {
      alreadyMarked = true;
    }
  } else {
    await markExternalAttendance(c.env.DB_lunar_attendance, {
      sessionId: body.sessionId,
      classId: targetClassId,
      studentId: student.id,
      studentName: student.name,
      attendanceDay,
      metadata: requestScanMetadata(c.req.raw, body.metadata),
    });
  }

  const targetClass = await getClassById(c.env.DB_lunar_attendance, targetClassId);

  const doId = c.env.durable_objects_lunar_attendance.idFromName(
    body.sessionId,
  );
  const stub = c.env.durable_objects_lunar_attendance.get(doId);
  await stub.fetch(
    new Request("https://do-internal/attend-broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: student.name,
        alreadyMarked,
        checkedOut,
        classCode: targetClass?.code,
        className: targetClass?.name,
      }),
    }),
  );

  return c.json({
    ok: true,
    alreadyMarked,
    checkedOut,
    studentName: student.name,
  });
});

// Create session (teacher)
app.post("/api/sessions", async (c) => {
  const sessionLimit = await requireRateLimit(
    c.env.KV_lunar_attendance,
    `teacher-session:${requestIp(c.req.raw)}`,
    20,
    60,
  );
  if (!sessionLimit.allowed) {
    return c.json({ error: "Too many session requests" }, 429);
  }

  const teacher = await getTeacherBySessionToken(
    c.env.DB_lunar_attendance,
    getCookie(c, TEACHER_SESSION_COOKIE),
  );
  if (!teacher) {
    return c.json({ error: "Teacher login required" }, 401);
  }
  const teacherSessionToken = getCookie(c, TEACHER_SESSION_COOKIE);
  const pinVerified = await isTeacherPinRecentlyVerified(
    c.env.DB_lunar_attendance,
    teacherSessionToken,
  );
  if (!pinVerified) {
    return c.json({ error: "PIN verification required" }, 403);
  }

  const { classId } = await c.req.json<{
    classId: string;
  }>();
  if (!reasonableText(classId, 80)) {
    return c.json({ error: "Missing or invalid class ID" }, 400);
  }

  if (classId !== "__all__") {
    const allowed = await teacherCanAccessClass(
      c.env.DB_lunar_attendance,
      teacher.id,
      classId,
    );
    if (!allowed) {
      return c.json({ error: "Teacher is not assigned to this class" }, 403);
    }
  }

  const teacherIp = requestIp(c.req.raw);
  let sessionId: string;
  const existing = await c.env.DB_lunar_attendance.prepare(
    `SELECT id
       FROM sessions
      WHERE class_id = ?
        AND teacher_id = ?
        AND status = 'active'
        AND date(created_at, 'unixepoch', ${SQLITE_LOCALTIME_MODIFIER}) = ?
      ORDER BY created_at DESC
      LIMIT 1`,
  )
    .bind(classId, teacher.id, localDateKey())
    .first<{ id: string }>();

  if (existing) {
    sessionId = existing.id;
    await c.env.DB_lunar_attendance.prepare(
      `UPDATE sessions SET ip_address = ? WHERE id = ?`,
    )
      .bind(teacherIp, sessionId)
      .run();
  } else {
    sessionId = crypto.randomUUID();
    await c.env.DB_lunar_attendance.prepare(
      `INSERT INTO sessions (id, class_id, teacher_id, ip_address) VALUES (?, ?, ?, ?)`,
    )
      .bind(sessionId, classId, teacher.id, teacherIp)
      .run();
  }

  const doId = c.env.durable_objects_lunar_attendance.idFromName(sessionId);
  const stub = c.env.durable_objects_lunar_attendance.get(doId);
  await stub.fetch(
    new Request("https://do-internal/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        classId,
        appOrigin: new URL(c.req.url).origin,
      }),
    }),
  );

  return c.json({ sessionId });
});

export default app;
