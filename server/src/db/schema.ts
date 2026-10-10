export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  creation TEXT -- JSON CreationPolicy: may this user create instances, which kinds, how many; NULL = role default
);

-- Non-admin users can be restricted to specific servers. Admins always see everything.
CREATE TABLE IF NOT EXISTS user_server_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  permissions TEXT, -- JSON array of ServerPermission; NULL = the role's defaults
  PRIMARY KEY (user_id, server_id)
);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL, -- java | bedrock | steam (validated at the application layer, like loader)
  loader TEXT NOT NULL, -- vanilla | paper | purpur | spigot | bedrock | steam
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
  created_by TEXT REFERENCES users(id),
  steam_app_id TEXT, -- Steam App ID actually installed, for platform = 'steam' servers
  steam_login TEXT NOT NULL DEFAULT 'anonymous', -- raw value passed after "+login" (e.g. "anonymous" or "user pass")
  steam_extra_flags TEXT NOT NULL DEFAULT '', -- extra steamcmd CLI flags spliced into the install/update invocation
  launch_config TEXT,
  restart_policy TEXT NOT NULL DEFAULT 'never', -- never | on-crash | always
  restart_delay_sec INTEGER NOT NULL DEFAULT 10,
  restart_max_attempts INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
  upnp_config TEXT, -- JSON UpnpConfig: router port-mapping rules
  isolation TEXT NOT NULL DEFAULT 'inherit', -- inherit | off (admin opt-out of the process sandbox)
  docker_config TEXT, -- JSON DockerConfig for platform = 'docker' -- JSON LaunchConfig: executable/args/env/stop/restart overrides (required for platform = 'custom')
  suspended BOOLEAN NOT NULL DEFAULT 0,
  suspended_reason TEXT,
  suspended_at TEXT,
  suspended_by TEXT
);

-- Other MultiCraft panels this one can transfer instances to. api_key is the remote panel's
-- node key (shown on its Configuration page) and has to be stored as-is to call that panel.
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple global key/value settings, admin-editable (e.g. where to source the SteamCMD tarball
-- from). Lives in the same SQLite file as everything else, so it's automatically included in the
-- existing "export the whole environment" backup/restore feature with no extra code.
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
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
