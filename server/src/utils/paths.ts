import path from 'node:path';
import { fileURLToPath } from 'node:url';

// server/src/utils -> server -> repo root/data
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.MULTICRAFT_DATA_DIR
  ? path.resolve(process.env.MULTICRAFT_DATA_DIR)
  : path.join(SERVER_ROOT, 'data');

export const DB_PATH = path.join(DATA_DIR, 'multicraft.db');
export const INSTANCES_DIR = path.join(DATA_DIR, 'servers');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const JAVA_RUNTIMES_DIR = path.join(DATA_DIR, 'runtimes');
export const WEB_DIST_DIR = path.resolve(SERVER_ROOT, '..', 'web', 'dist');

export function instanceDir(serverId: string): string {
  return path.join(INSTANCES_DIR, serverId);
}

export function backupDir(serverId: string): string {
  return path.join(BACKUPS_DIR, serverId);
}

/**
 * Resolves a user-supplied relative path against a base directory, guaranteeing
 * the result stays inside that base directory (blocks `..` traversal and absolute
 * path escapes). Throws if the path would escape.
 */
export function safeJoin(base: string, relative: string): string {
  const normalizedRelative = (relative ?? '').split('\\').join('/');
  const target = path.resolve(base, '.' + path.sep + normalizedRelative);
  const baseResolved = path.resolve(base);
  if (target !== baseResolved && !target.startsWith(baseResolved + path.sep)) {
    throw new Error('Path escapes the allowed directory');
  }
  return target;
}
