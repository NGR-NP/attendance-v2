-- Migration number: 0001 	 2026-06-18T16:13:38.982Z

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher'
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  ends_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  contact_number TEXT,
  secondary_contact_number TEXT
);

CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

CREATE TABLE IF NOT EXISTS student_classes (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, class_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS student_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS teacher_sessions (
  token TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  pin_verified_at INTEGER
);

CREATE TABLE IF NOT EXISTS student_access_grants (
  token TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by_teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS student_access_tokens (
  token TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  attendance_day TEXT NOT NULL,
  attended_at INTEGER NOT NULL DEFAULT (unixepoch()),
  checked_out_at INTEGER,
  requester_ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  client_timezone TEXT,
  client_language TEXT,
  client_platform TEXT,
  screen_size TEXT,
  UNIQUE(class_id, student_id, attendance_day)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_day ON attendance_records(attendance_day);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_sessions_teacher ON teacher_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_access_grants_student ON student_access_grants(student_id);
CREATE INDEX IF NOT EXISTS idx_student_access_tokens_student ON student_access_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_class_day ON sessions(teacher_id, class_id, created_at);
