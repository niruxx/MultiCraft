import type { DatabaseSync } from 'node:sqlite';
import { logger } from '../utils/logger.js';

/**
 * Runs idempotent schema migrations against an already-open database (after SCHEMA_SQL has run).
 * `CREATE TABLE IF NOT EXISTS` never touches an existing table, so any change to an existing
 * table's shape needs an explicit, guarded migration step here. Each step checks whether it's
 * already been applied before doing anything, so this is safe to call on every startup.
 */
export function runMigrations(db: DatabaseSync): void {
  addSteamAppIdColumn(db);
  dropPlatformCheckConstraint(db);
}

function addSteamAppIdColumn(db: DatabaseSync): void {
  const hasColumn = db.prepare("SELECT 1 FROM pragma_table_info('servers') WHERE name = 'steam_app_id'").get();
  if (hasColumn) return;
  logger.info('Migrating database: adding servers.steam_app_id column');
  db.exec('ALTER TABLE servers ADD COLUMN steam_app_id TEXT');
}

// SQLite can't ALTER a CHECK constraint in place — the only way to loosen one is to rebuild the
// table. Older installs have `platform TEXT NOT NULL CHECK (platform IN ('java', 'bedrock'))`,
// which rejects the new 'steam' platform. Detect that by reading the table's live DDL text.
function dropPlatformCheckConstraint(db: DatabaseSync): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'servers'").get() as
    | { sql: string }
    | undefined;
  if (!row || !/CHECK\s*\(\s*platform\s+IN/i.test(row.sql)) return;

  logger.info('Migrating database: dropping the platform CHECK constraint on servers (rebuilding table)');
  // PRAGMA foreign_keys is a no-op inside a transaction, so it must be toggled outside one —
  // otherwise DROP TABLE servers_old would fail against user_server_access's FK reference.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('ALTER TABLE servers RENAME TO servers_old');
      db.exec(`
        CREATE TABLE servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          platform TEXT NOT NULL,
          loader TEXT NOT NULL,
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
          steam_app_id TEXT
        )
      `);
      db.exec(`
        INSERT INTO servers
          (id, name, platform, loader, version, build, jar_file, min_memory_mb, max_memory_mb,
           server_port, extra_java_args, extra_args, auto_start, status, created_at, created_by, steam_app_id)
        SELECT
          id, name, platform, loader, version, build, jar_file, min_memory_mb, max_memory_mb,
          server_port, extra_java_args, extra_args, auto_start, status, created_at, created_by, steam_app_id
        FROM servers_old
      `);
      db.exec('DROP TABLE servers_old');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  logger.info('Migration complete: servers.platform no longer restricted by a CHECK constraint');
}
