import fs from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH } from '../utils/paths.js';
import { SCHEMA_SQL } from './schema.js';
import { logger } from '../utils/logger.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(SCHEMA_SQL);

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
