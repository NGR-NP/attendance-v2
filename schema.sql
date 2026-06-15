DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS enrollment_tokens;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  -- active | paused | ended
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER
);
-- wrangler d1 execute DB_lunar_attendance --local --file=./schema.sql
-- wrangler d1 export DB_lunar_attendance --local --output ./local_data.sql