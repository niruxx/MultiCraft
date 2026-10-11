import fs from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH, LEGACY_DB_PATH } from '../utils/paths.js';
import { SCHEMA_SQL } from './schema.js';
import { runMigrations } from './migrations.js';
import { logger } from '../utils/logger.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

// Installs from before the rename to Outpost have multicraft.db — move it (and its WAL/SHM
// journal files) to the new name before opening, so nothing is lost or duplicated.
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(LEGACY_DB_PATH + suffix)) fs.renameSync(LEGACY_DB_PATH + suffix, DB_PATH + suffix);
  }
  logger.info(`Renamed ${LEGACY_DB_PATH} to ${DB_PATH}`);
}

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(SCHEMA_SQL);
runMigrations(db);

logger.info(`Database ready at ${DB_PATH}`);

const statementCache = new Map<string, StatementSync>();

/** Prepares (and caches) a statement. node:sqlite StatementSync objects are cheap to reuse. */
export function prep(sql: string): StatementSync {
  let stmt = statementCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
}

/**
 * Closes the database file handle. Only used right before an environment import swaps the
 * entire data directory out from under this process — the process exits immediately after,
 * so nothing re-opens it; a fresh `db.ts` module load on the next start reopens the restored file.
 */
export function closeDatabase(): void {
  statementCache.clear();
  db.close();
}
