export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Non-admin users can be restricted to specific servers. Admins always see everything.
CREATE TABLE IF NOT EXISTS user_server_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, server_id)
);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('java', 'bedrock')),
  loader TEXT NOT NULL, -- vanilla | paper | purpur | bedrock
  version TEXT NOT NULL,
  build TEXT,
  jar_file TEXT,
  min_memory_mb INTEGER NOT NULL DEFAULT 1024,
  max_memory_mb INTEGER NOT NULL DEFAULT 2048,
  server_port INTEGER NOT NULL DEFAULT 25565,
  extra_java_args TEXT NOT NULL DEFAULT '',
  extra_args TEXT NOT NULL DEFAULT '',
  auto_start BOOLEAN NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'installing',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS backup_schedules (
  server_id TEXT PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL,
  retention_count INTEGER NOT NULL DEFAULT 5,
  enabled BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
