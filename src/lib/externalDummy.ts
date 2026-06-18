export const TEACHER_SESSION_COOKIE = "teacher_session";
export const TEACHER_PIN_VERIFICATION_TTL_SECONDS = 10 * 60;
const STUDENT_IDLE_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_COURSE_DURATION_SECONDS = 180 * 24 * 60 * 60;

export interface ExternalTeacher {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ExternalClass {
  id: string;
  name: string;
  code: string;
}

export interface ExternalStudent {
  id: string;
  name: string;
  email: string;
}

export interface ExternalStudentAccess {
  studentId: string;
  studentName: string;
  studentEmail: string;
}

export interface ExternalAttendanceDay {
  day: string;
  total: number;
  sessions: number;
}

export interface ExternalStudentAttendanceSummary {
  studentId: string;
  daysPresent: number;
  latestAt: number | null;
}

export interface ExternalStudentAttendanceRecord {
  day: string;
  time: string;
  sessionId: string;
  requesterIp: string | null;
  userAgent: string | null;
  deviceType: string | null;
  country: string | null;
  clientTimezone: string | null;
  clientLanguage: string | null;
  clientPlatform: string | null;
  screenSize: string | null;
}

export interface AttendanceScanMetadata {
  requesterIp?: string;
  userAgent?: string;
  deviceType?: string;
  country?: string;
  clientTimezone?: string;
  clientLanguage?: string;
  clientPlatform?: string;
  screenSize?: string;
}

let schemaEnsured = false;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function randomToken(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function ensureTextColumn(db: D1Database, table: string, column: string) {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`).run();
  } catch {}
}

async function ensureIntegerColumn(
  db: D1Database,
  table: string,
  column: string,
) {
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER`).run();
  } catch {}
}

async function ensureAttendanceMetadataColumns(db: D1Database) {
  const columns = [
    "requester_ip",
    "user_agent",
    "device_type",
    "country",
    "client_timezone",
    "client_language",
    "client_platform",
    "screen_size",
  ];

  for (const column of columns) {
    await ensureTextColumn(db, "attendance_records", column);
  }
}

async function studentCourseAccessExpiresAt(db: D1Database, studentId: string) {
  const fallback = nowSeconds() + DEFAULT_COURSE_DURATION_SECONDS;
  const row = await db
    .prepare(
      `SELECT MAX(c.ends_at) AS expiresAt
         FROM student_classes sc
         JOIN classes c ON c.id = sc.class_id
        WHERE sc.student_id = ?`,
    )
    .bind(studentId)
    .first<{ expiresAt: number | null }>();

  return row?.expiresAt ?? fallback;
}

export async function findTeacherByCredentials(
  db: D1Database,
  email: string,
  pin: string,
) {
  //
  return db
    .prepare(
      `SELECT id, name, email, role
         FROM teachers
        WHERE lower(email) = lower(?)
          AND pin = ?
        LIMIT 1`,
    )
    .bind(email.trim(), pin.trim())
    .first<ExternalTeacher>();
}

export async function createTeacherSession(db: D1Database, teacherId: string) {
  //
  const token = randomToken("teacher");
  const expiresAt = nowSeconds() + 60 * 60 * 24 * 14;
  const pinVerifiedAt = nowSeconds();

  await db
    .prepare(
      `INSERT INTO teacher_sessions (token, teacher_id, expires_at, pin_verified_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(token, teacherId, expiresAt, pinVerifiedAt)
    .run();

  return { token, expiresAt };
}

export async function isTeacherPinRecentlyVerified(
  db: D1Database,
  token: string | undefined,
  ttlSeconds = TEACHER_PIN_VERIFICATION_TTL_SECONDS,
) {
  if (!token) return false;
  //

  const row = await db
    .prepare(
      `SELECT pin_verified_at AS pinVerifiedAt
         FROM teacher_sessions
        WHERE token = ?
          AND expires_at > ?
        LIMIT 1`,
    )
    .bind(token, nowSeconds())
    .first<{ pinVerifiedAt: number | null }>();

  return Boolean(
    row?.pinVerifiedAt && row.pinVerifiedAt > nowSeconds() - ttlSeconds,
  );
}

export async function verifyTeacherSessionPin(
  db: D1Database,
  token: string | undefined,
  pin: string,
) {
  if (!token) return false;
  //

  const row = await db
    .prepare(
      `SELECT ts.token
         FROM teacher_sessions ts
         JOIN teachers t ON t.id = ts.teacher_id
        WHERE ts.token = ?
          AND ts.expires_at > ?
          AND t.pin = ?
        LIMIT 1`,
    )
    .bind(token, nowSeconds(), pin.trim())
    .first<{ token: string }>();

  if (!row) return false;

  await db
    .prepare(
      `UPDATE teacher_sessions
          SET pin_verified_at = ?
        WHERE token = ?`,
    )
    .bind(nowSeconds(), token)
    .run();

  return true;
}

export async function deleteTeacherSession(db: D1Database, token: string) {
  //
  await db
    .prepare(`DELETE FROM teacher_sessions WHERE token = ?`)
    .bind(token)
    .run();
}

export async function getTeacherBySessionToken(
  db: D1Database,
  token: string | undefined,
) {
  if (!token) return null;
  //

  return db
    .prepare(
      `SELECT t.id, t.name, t.email, t.role
         FROM teacher_sessions ts
         JOIN teachers t ON t.id = ts.teacher_id
        WHERE ts.token = ?
          AND ts.expires_at > ?
        LIMIT 1`,
    )
    .bind(token, nowSeconds())
    .first<ExternalTeacher>();
}

export async function listTeacherClasses(
  db: D1Database,
  teacherId: string,
): Promise<(ExternalClass & { studentCount: number })[]> {
  //
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.code, COUNT(sc.student_id) AS studentCount
         FROM teacher_classes tc
         JOIN classes c ON c.id = tc.class_id
         LEFT JOIN student_classes sc ON sc.class_id = c.id
        WHERE tc.teacher_id = ?
        GROUP BY c.id, c.name, c.code
        ORDER BY c.code`,
    )
    .bind(teacherId)
    .all<ExternalClass & { studentCount: number }>();

  return results ?? [];
}


export async function teacherCanAccessClass(
  db: D1Database,
  teacherId: string,
  classId: string,
) {
  //
  const row = await db
    .prepare(
      `SELECT 1 AS ok
         FROM teacher_classes
        WHERE teacher_id = ?
          AND class_id = ?
        LIMIT 1`,
    )
    .bind(teacherId, classId)
    .first<{ ok: number }>();

  return Boolean(row);
}

export async function getClassById(db: D1Database, classId: string) {
  //
  return db
    .prepare(
      `SELECT id, name, code
         FROM classes
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(classId)
    .first<ExternalClass>();
}

export async function listClassStudents(db: D1Database, classId: string) {
  //
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.email
         FROM student_classes sc
         JOIN students s ON s.id = sc.student_id
        WHERE sc.class_id = ?
        ORDER BY s.name`,
    )
    .bind(classId)
    .all<ExternalStudent>();

  return results ?? [];
}

export async function getClassStudent(
  db: D1Database,
  classId: string,
  studentId: string,
) {
  //
  return db
    .prepare(
      `SELECT s.id, s.name, s.email
         FROM student_classes sc
         JOIN students s ON s.id = sc.student_id
        WHERE sc.class_id = ?
          AND sc.student_id = ?
        LIMIT 1`,
    )
    .bind(classId, studentId)
    .first<ExternalStudent>();
}

export async function countClassStudents(db: D1Database, classId: string) {
  //
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM student_classes
        WHERE class_id = ?`,
    )
    .bind(classId)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function createStudentAccessGrant(
  db: D1Database,
  studentId: string,
  teacherId: string,
) {
  //
  const token = randomToken("grant");
  const expiresAt = nowSeconds() + 10 * 60;

  await db
    .prepare(
      `INSERT INTO student_access_grants
        (token, student_id, created_by_teacher_id, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(token, studentId, teacherId, expiresAt)
    .run();

  return { token, expiresAt };
}

export async function claimStudentAccessGrant(
  db: D1Database,
  token: string,
): Promise<
  | { ok: true; accessToken: string; student: ExternalStudent }
  | { ok: false; error: string }
> {
  //
  const grant = await db
    .prepare(
      `SELECT token, student_id AS studentId, expires_at AS expiresAt, used_at AS usedAt
         FROM student_access_grants
        WHERE token = ?
        LIMIT 1`,
    )
    .bind(token)
    .first<{
      token: string;
      studentId: string;
      expiresAt: number;
      usedAt: number | null;
    }>();

  if (!grant) return { ok: false, error: "Access QR not found" };
  if (grant.usedAt) return { ok: false, error: "Access QR already used" };
  if (grant.expiresAt <= nowSeconds()) {
    return { ok: false, error: "Access QR expired" };
  }

  const update = await db
    .prepare(
      `UPDATE student_access_grants
          SET used_at = ?
        WHERE token = ?
          AND used_at IS NULL
          AND expires_at > ?`,
    )
    .bind(nowSeconds(), token, nowSeconds())
    .run();

  if ((update.meta?.changes ?? 0) === 0) {
    return { ok: false, error: "Access QR already used" };
  }

  const student = await db
    .prepare(
      `SELECT id, name, email
         FROM students
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(grant.studentId)
    .first<ExternalStudent>();

  if (!student) return { ok: false, error: "Student not found" };

  const accessToken = randomToken("student");
  const expiresAt = await studentCourseAccessExpiresAt(db, student.id);
  const createdAt = nowSeconds();
  await db
    .prepare(
      `INSERT INTO student_access_tokens
        (token, student_id, created_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(accessToken, student.id, createdAt, expiresAt, createdAt)
    .run();

  return { ok: true, accessToken, student };
}

export async function verifyStudentAccessForClass(
  db: D1Database,
  accessToken: string,
  classId: string,
) {
  //
  return db
    .prepare(
      `SELECT s.id AS studentId, s.name AS studentName, s.email AS studentEmail
         FROM student_access_tokens sat
         JOIN students s ON s.id = sat.student_id
         JOIN student_classes sc ON sc.student_id = s.id
         JOIN classes c ON c.id = sc.class_id
        WHERE sat.token = ?
          AND sat.revoked_at IS NULL
          AND sat.expires_at > ?
          AND sat.last_used_at > ?
          AND sc.class_id = ?
          AND c.ends_at > ?
        LIMIT 1`,
    )
    .bind(
      accessToken,
      nowSeconds(),
      nowSeconds() - STUDENT_IDLE_TIMEOUT_SECONDS,
      classId,
      nowSeconds(),
    )
    .first<ExternalStudentAccess>();
}

export async function rotateStudentAccessToken(
  db: D1Database,
  accessToken: string,
  studentId: string,
) {
  //
  const now = nowSeconds();
  const existing = await db
    .prepare(
      `SELECT expires_at AS expiresAt
         FROM student_access_tokens
        WHERE token = ?
          AND student_id = ?
          AND revoked_at IS NULL
          AND expires_at > ?
          AND last_used_at > ?
        LIMIT 1`,
    )
    .bind(accessToken, studentId, now, now - STUDENT_IDLE_TIMEOUT_SECONDS)
    .first<{ expiresAt: number }>();

  if (!existing) return null;

  const nextAccessToken = randomToken("student");
  const update = await db
    .prepare(
      `UPDATE student_access_tokens
          SET revoked_at = ?
        WHERE token = ?
          AND student_id = ?
          AND revoked_at IS NULL`,
    )
    .bind(now, accessToken, studentId)
    .run();

  if ((update.meta?.changes ?? 0) === 0) return null;

  await db
    .prepare(
      `INSERT INTO student_access_tokens
        (token, student_id, created_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(nextAccessToken, studentId, now, existing.expiresAt, now)
    .run();

  return { accessToken: nextAccessToken, expiresAt: existing.expiresAt };
}

export async function markExternalAttendance(
  db: D1Database,
  input: {
    sessionId: string;
    classId: string;
    studentId: string;
    studentName: string;
    attendanceDay: string;
    metadata?: AttendanceScanMetadata;
  },
) {
  //

  const alreadyMarked = await db
    .prepare(
      `SELECT student_name AS studentName
         FROM attendance_records
        WHERE class_id = ?
          AND student_id = ?
          AND attendance_day = ?
        LIMIT 1`,
    )
    .bind(input.classId, input.studentId, input.attendanceDay)
    .first<{ studentName: string }>();

  if (alreadyMarked) {
    return {
      ok: true as const,
      alreadyMarked: true,
      studentName: alreadyMarked.studentName,
    };
  }

  try {
    await db
      .prepare(
        `INSERT INTO attendance_records
           (id, session_id, class_id, student_id, student_name, attendance_day, attended_at,
            requester_ip, user_agent, device_type, country, client_timezone,
            client_language, client_platform, screen_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.sessionId,
        input.classId,
        input.studentId,
        input.studentName,
        input.attendanceDay,
        nowSeconds(),
        input.metadata?.requesterIp ?? null,
        input.metadata?.userAgent ?? null,
        input.metadata?.deviceType ?? null,
        input.metadata?.country ?? null,
        input.metadata?.clientTimezone ?? null,
        input.metadata?.clientLanguage ?? null,
        input.metadata?.clientPlatform ?? null,
        input.metadata?.screenSize ?? null,
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed")) {
      return {
        ok: true as const,
        alreadyMarked: true,
        studentName: input.studentName,
      };
    }
    throw error;
  }

  return {
    ok: true as const,
    alreadyMarked: false,
    studentName: input.studentName,
  };
}

export async function listClassAttendanceDays(db: D1Database, classId: string) {
  //
  const { results } = await db
    .prepare(
      `SELECT attendance_day AS day,
              COUNT(DISTINCT student_id) AS total,
              COUNT(DISTINCT session_id) AS sessions
         FROM attendance_records
        WHERE class_id = ?
        GROUP BY attendance_day
        ORDER BY attendance_day DESC`,
    )
    .bind(classId)
    .all<ExternalAttendanceDay>();

  return results ?? [];
}

export async function listStudentAttendanceSummaries(
  db: D1Database,
  classId: string,
) {
  //
  const { results } = await db
    .prepare(
      `SELECT student_id AS studentId,
              COUNT(DISTINCT attendance_day) AS daysPresent,
              MAX(attended_at) AS latestAt
         FROM attendance_records
        WHERE class_id = ?
        GROUP BY student_id`,
    )
    .bind(classId)
    .all<ExternalStudentAttendanceSummary>();

  return results ?? [];
}

export async function listStudentAttendanceRecords(
  db: D1Database,
  classId: string,
  studentId: string,
) {
  //
  const { results } = await db
    .prepare(
      `SELECT attendance_day AS day,
              time(attended_at, 'unixepoch', '+5 hours', '+45 minutes') AS time,
              session_id AS sessionId,
              requester_ip AS requesterIp,
              user_agent AS userAgent,
              device_type AS deviceType,
              country,
              client_timezone AS clientTimezone,
              client_language AS clientLanguage,
              client_platform AS clientPlatform,
              screen_size AS screenSize
         FROM attendance_records
        WHERE class_id = ?
          AND student_id = ?
        ORDER BY attended_at DESC`,
    )
    .bind(classId, studentId)
    .all<ExternalStudentAttendanceRecord>();

  return results ?? [];
}

export async function listAllTeachers(db: D1Database, search?: string) {
  const query = search ? `%${search}%` : null;
  const { results } = await db
    .prepare(
      `SELECT id, name, email FROM teachers 
        WHERE (? IS NULL OR name LIKE ? OR email LIKE ?)
        ORDER BY name`,
    )
    .bind(query, query, query)
    .all<ExternalTeacher>();
  return results ?? [];
}
export async function createTeacher(
  db: D1Database,
  name: string,
  email: string,
  pin: string,
) {
  const id = `teacher_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await db
    .prepare(`INSERT INTO teachers (id, name, email, pin) VALUES (?, ?, ?, ?)`)
    .bind(id, name.trim(), email.trim().toLowerCase(), pin.trim())
    .run();
  return { id };
}
export async function deleteTeacher(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM teachers WHERE id = ?`).bind(id).run();
}
export async function listAllStudents(db: D1Database, search?: string) {
  const query = search ? `%${search}%` : null;
  const { results } = await db
    .prepare(
      `SELECT id, name, email FROM students 
        WHERE (? IS NULL OR name LIKE ? OR email LIKE ?)
        ORDER BY name`,
    )
    .bind(query, query, query)
    .all<ExternalStudent>();
  return results ?? [];
}
export async function createStudent(
  db: D1Database,
  name: string,
  email: string,
) {
  const id = `student_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await db
    .prepare(`INSERT INTO students (id, name, email) VALUES (?, ?, ?)`)
    .bind(id, name.trim(), email.trim().toLowerCase())
    .run();
  return { id };
}
export async function deleteStudent(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM students WHERE id = ?`).bind(id).run();
}
export interface ExternalClassFull extends ExternalClass {
  endsAt: number;
}
export async function listAllClasses(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT id, name, code, ends_at AS endsAt FROM classes ORDER BY code`,
    )
    .all<ExternalClassFull>();
  return results ?? [];
}
export async function createClass(db: D1Database, name: string, code: string) {
  const id = code.trim().toUpperCase().replace(/\s+/g, "_");
  const endsAt = nowSeconds() + DEFAULT_COURSE_DURATION_SECONDS;
  await db
    .prepare(
      `INSERT INTO classes (id, name, code, ends_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(id, name.trim(), code.trim().toUpperCase(), endsAt)
    .run();
  return { id };
}
export async function deleteClass(db: D1Database, id: string) {
  await db.prepare(`DELETE FROM classes WHERE id = ?`).bind(id).run();
}
export async function getClassFull(db: D1Database, classId: string) {
  return db
    .prepare(
      `SELECT id, name, code, ends_at AS endsAt
         FROM classes
        WHERE id = ?
        LIMIT 1`,
    )
    .bind(classId)
    .first<ExternalClassFull>();
}
export async function listEnrolledStudents(db: D1Database, classId: string) {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.email
         FROM student_classes sc
         JOIN students s ON s.id = sc.student_id
        WHERE sc.class_id = ?
        ORDER BY s.name`,
    )
    .bind(classId)
    .all<ExternalStudent>();
  return results ?? [];
}
export async function listUnenrolledStudents(db: D1Database, classId: string) {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.email
         FROM students s
        WHERE s.id NOT IN (
          SELECT sc.student_id
            FROM student_classes sc
           WHERE sc.class_id = ?
        )
        ORDER BY s.name`,
    )
    .bind(classId)
    .all<ExternalStudent>();
  return results ?? [];
}
export async function enrollStudentInClass(
  db: D1Database,
  studentId: string,
  classId: string,
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO student_classes (student_id, class_id)
       VALUES (?, ?)`,
    )
    .bind(studentId, classId)
    .run();
}
export async function removeStudentFromClass(
  db: D1Database,
  studentId: string,
  classId: string,
) {
  await db
    .prepare(
      `DELETE FROM student_classes
        WHERE student_id = ? AND class_id = ?`,
    )
    .bind(studentId, classId)
    .run();
}
export async function listAssignedTeachers(db: D1Database, classId: string) {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.name, t.email
         FROM teacher_classes tc
         JOIN teachers t ON t.id = tc.teacher_id
        WHERE tc.class_id = ?
        ORDER BY t.name`,
    )
    .bind(classId)
    .all<ExternalTeacher>();
  return results ?? [];
}
export async function listUnassignedTeachers(db: D1Database, classId: string) {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.name, t.email
         FROM teachers t
        WHERE t.id NOT IN (
          SELECT tc.teacher_id
            FROM teacher_classes tc
           WHERE tc.class_id = ?
        )
        ORDER BY t.name`,
    )
    .bind(classId)
    .all<ExternalTeacher>();
  return results ?? [];
}
export async function assignTeacherToClass(
  db: D1Database,
  teacherId: string,
  classId: string,
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO teacher_classes (teacher_id, class_id)
       VALUES (?, ?)`,
    )
    .bind(teacherId, classId)
    .run();
}
export async function removeTeacherFromClass(
  db: D1Database,
  teacherId: string,
  classId: string,
) {
  await db
    .prepare(
      `DELETE FROM teacher_classes
        WHERE teacher_id = ? AND class_id = ?`,
    )
    .bind(teacherId, classId)
    .run();
}
export async function listAllAttendanceRecords(db: D1Database, limit = 100) {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.student_name AS studentName, r.attendance_day AS day,
              time(r.attended_at, 'unixepoch', '+5 hours', '+45 minutes') AS time,
              c.code AS classCode, r.class_id AS classId, r.student_id AS studentId,
              r.device_type AS deviceType, r.country
         FROM attendance_records r
         JOIN classes c ON c.id = r.class_id
        ORDER BY r.attended_at DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: string;
      studentName: string;
      day: string;
      time: string;
      classCode: string;
      classId: string;
      studentId: string;
      deviceType: string | null;
      country: string | null;
    }>();
  return results ?? [];
}
export async function deleteAttendanceRecord(db: D1Database, id: string) {
  await db
    .prepare(`DELETE FROM attendance_records WHERE id = ?`)
    .bind(id)
    .run();
}
export async function listAllAttendanceRecordsForExport(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.student_name AS studentName, r.attendance_day AS day,
              time(r.attended_at, 'unixepoch', '+5 hours', '+45 minutes') AS time,
              c.code AS classCode, r.student_id AS studentId,
              r.requester_ip AS requesterIp, r.user_agent AS userAgent,
              r.device_type AS deviceType, r.country, r.client_timezone AS clientTimezone
         FROM attendance_records r
         JOIN classes c ON c.id = r.class_id
        ORDER BY r.attended_at DESC`,
    )
    .all<{
      id: string;
      studentName: string;
      day: string;
      time: string;
      classCode: string;
      studentId: string;
      requesterIp: string | null;
      userAgent: string | null;
      deviceType: string | null;
      country: string | null;
      clientTimezone: string | null;
    }>();
  return results ?? [];
}
export async function getAdminStats(db: D1Database) {
  const [teachers, students, classes, records] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS count FROM teachers`)
      .first<{ count: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS count FROM students`)
      .first<{ count: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS count FROM classes`)
      .first<{ count: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS count FROM attendance_records`)
      .first<{ count: number }>(),
  ]);
  return {
    teachers: teachers?.count ?? 0,
    students: students?.count ?? 0,
    classes: classes?.count ?? 0,
    attendance: records?.count ?? 0,
  };
}

export async function createStudentSession(db: D1Database, studentId: string) {
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
  await db.prepare(`INSERT INTO student_sessions (id, student_id, expires_at) VALUES (?, ?, ?)`)
    .bind(sessionId, studentId, expiresAt)
    .run();
  return { sessionId, expiresAt };
}

export async function getStudentBySessionToken(db: D1Database, sessionId: string) {
  if (!sessionId) return null;
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT s.id, s.name, s.email, ss.expires_at AS expiresAt
    FROM student_sessions ss
    JOIN students s ON s.id = ss.student_id
    WHERE ss.id = ? AND ss.expires_at > ?
  `).bind(sessionId, now).first<ExternalStudent & { expiresAt: number }>();
}

export async function touchStudentSession(db: D1Database, sessionId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  await db.prepare(`UPDATE student_sessions SET expires_at = ? WHERE id = ?`)
    .bind(expiresAt, sessionId)
    .run();
}

export async function createStudentWithContact(db: D1Database, name: string, email: string, contactNumber: string, secondaryContactNumber: string) {
  const id = `student_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await db.prepare(`INSERT INTO students (id, name, email, contact_number, secondary_contact_number) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, name.trim(), email.trim().toLowerCase(), contactNumber.trim(), secondaryContactNumber.trim())
    .run();
  return { id };
}

export async function listStudentEnrolledClassesForTeacher(
  db: D1Database,
  studentId: string,
  teacherId: string,
) {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.code
         FROM student_classes sc
         JOIN classes c ON c.id = sc.class_id
         JOIN teacher_classes tc ON tc.class_id = sc.class_id
        WHERE sc.student_id = ?
          AND tc.teacher_id = ?
        ORDER BY c.code`,
    )
    .bind(studentId, teacherId)
    .all<ExternalClass>();

  return results ?? [];
}

export async function verifyStudentAccessForTeacher(
  db: D1Database,
  accessToken: string,
  teacherId: string,
) {
  return db
    .prepare(
      `SELECT s.id AS studentId, s.name AS studentName, s.email AS studentEmail
         FROM student_access_tokens sat
         JOIN students s ON s.id = sat.student_id
         JOIN student_classes sc ON sc.student_id = s.id
         JOIN teacher_classes tc ON tc.class_id = sc.class_id
        WHERE sat.token = ?
          AND sat.revoked_at IS NULL
          AND sat.expires_at > ?
          AND sat.last_used_at > ?
          AND tc.teacher_id = ?
        LIMIT 1`,
    )
    .bind(
      accessToken,
      nowSeconds(),
      nowSeconds() - STUDENT_IDLE_TIMEOUT_SECONDS,
      teacherId,
    )
    .first<ExternalStudentAccess>();
}

// ── Today's Attendance ────────────────────────────────────────────────

export interface TodayAttendanceRecord {
  id: string;
  studentName: string;
  studentId: string;
  className: string;
  classCode: string;
  classId: string;
  /** Local time string e.g. "09:32:15" (NPT +05:45) */
  time: string;
  deviceType: string | null;
  country: string | null;
}

/**
 * List all attendance records for a given local date key (YYYY-MM-DD).
 * When `options.teacherId` is supplied, results are scoped to that teacher's
 * assigned classes only — prevents data leakage between teachers.
 */
export async function listAttendanceForDay(
  db: D1Database,
  day: string,
  options?: { teacherId?: string },
): Promise<TodayAttendanceRecord[]> {
  if (options?.teacherId) {
    // Filtered path: JOIN teacher_classes to scope to the teacher's classes.
    // Uses a JOIN instead of a subquery so D1 can use an index efficiently.
    const { results } = await db
      .prepare(
        `SELECT r.id,
                r.student_name   AS studentName,
                r.student_id     AS studentId,
                c.name           AS className,
                c.code           AS classCode,
                r.class_id       AS classId,
                time(r.attended_at, 'unixepoch', '+5 hours', '+45 minutes') AS time,
                r.device_type    AS deviceType,
                r.country
           FROM attendance_records r
           JOIN classes c          ON c.id = r.class_id
           JOIN teacher_classes tc ON tc.class_id = r.class_id
          WHERE r.attendance_day = ?
            AND tc.teacher_id = ?
          ORDER BY r.attended_at DESC`,
      )

      .bind(day, options.teacherId)
      .all<TodayAttendanceRecord>();
    return results ?? [];
  }

  // Unfiltered path: admin sees all records for the day.
  const { results } = await db
    .prepare(
      `SELECT r.id,
              r.student_name   AS studentName,
              r.student_id     AS studentId,
              c.name           AS className,
              c.code           AS classCode,
              r.class_id       AS classId,
              time(r.attended_at, 'unixepoch', '+5 hours', '+45 minutes') AS time,
              r.device_type    AS deviceType,
              r.country
         FROM attendance_records r
         JOIN classes c ON c.id = r.class_id
        WHERE r.attendance_day = ?
        ORDER BY r.attended_at DESC`,
    )
    .bind(day)
    .all<TodayAttendanceRecord>();
  return results ?? [];
}

