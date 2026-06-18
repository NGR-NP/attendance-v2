-- Migration number: 0003 	 2026-06-18T17:00:00.000Z

CREATE TABLE IF NOT EXISTS allowed_wifi_ips (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  ip_address TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_allowed_wifi_ips_enabled ON allowed_wifi_ips(enabled, ip_address);
