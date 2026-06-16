DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS student_sessions;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS student_classes;
DROP TABLE IF EXISTS teacher_classes;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS teachers;

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' -- 'admin', 'teacher', 'attendance_display'
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
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | ended
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

-- wrangler d1 execute DB_lunar_attendance --local --file=./schema.sql
-- wrangler d1 export DB_lunar_attendance --local --output ./local_data.sql