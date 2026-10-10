import crypto from 'node:crypto';
import { prep, db } from '../db/db.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { PublicUser, Role, User } from '../types/index.js';

function toPublic(user: User): PublicUser {
  const { password_hash, password_salt, ...rest } = user;
  return rest;
}

export function countUsers(): number {
  const row = prep('SELECT COUNT(*) as c FROM users').get() as { c: number };
  return row.c;
}

export function createUser(username: string, password: string, role: Role): PublicUser {
  const existing = prep('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) throw new Error('A user with that username already exists');
  const { hash, salt } = hashPassword(password);
  const id = crypto.randomUUID();
  prep(
    'INSERT INTO users (id, username, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, username, hash, salt, role);
  return toPublic(getUserById(id)!);
}

export function getUserById(id: string): User | undefined {
  return prep('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  return prep('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function listUsers(): PublicUser[] {
  const rows = prep('SELECT * FROM users ORDER BY created_at ASC').all() as unknown as User[];
  return rows.map(toPublic);
}

export function authenticate(username: string, password: string): PublicUser | null {
  const user = getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash, user.password_salt)) return null;
  return toPublic(user);
}

export function updateUserRole(id: string, role: Role) {
  prep('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

export function updateUserPassword(id: string, password: string) {
  const { hash, salt } = hashPassword(password);
  prep('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id);
}

export function deleteUser(id: string) {
  prep('DELETE FROM users WHERE id = ?').run(id);
}

/**
 * What a user may do inside an instance they've been assigned. Seeing an assigned instance
 * (status, console output, player list) needs no permission; everything that changes it does.
 */
export const SERVER_PERMISSIONS = [
  'power', // start / stop / restart / kill / retry install
  'console', // send console commands
  'files.read', // browse & download files, browse snapshot contents
  'files.write', // edit, upload, rename, delete files
  'backups.create', // create & delete snapshots, edit the snapshot schedule
  'backups.restore', // restore a whole snapshot or single files from one
  'plugins', // install, toggle, remove plugins / mods / packs
  'players', // op, kick, ban, whitelist
  'settings', // instance configuration & server.properties
  'update', // change version / update the server software
  'launch', // change the launch command/executable — effectively running arbitrary code, so opt-in
] as const;

export type ServerPermission = (typeof SERVER_PERMISSIONS)[number];

export function roleDefaultPermissions(role: Role): ServerPermission[] {
  if (role === 'viewer') return ['files.read'];
  return SERVER_PERMISSIONS.filter((p) => p !== 'launch');
}

function sanitizePermissions(value: unknown): ServerPermission[] | null {
  if (!Array.isArray(value)) return null;
  return SERVER_PERMISSIONS.filter((p) => value.includes(p));
}

export interface ServerAccessEntry {
  serverId: string;
  /** null = the role's defaults */
  permissions: ServerPermission[] | null;
}

/** Replaces a user's instance assignments. Accepts plain ids (role defaults) or per-instance permission sets. */
export function setUserServerAccess(userId: string, entries: (string | ServerAccessEntry)[]) {
  db.prepare('DELETE FROM user_server_access WHERE user_id = ?').run(userId);
  const insert = prep('INSERT OR IGNORE INTO user_server_access (user_id, server_id, permissions) VALUES (?, ?, ?)');
  for (const entry of entries) {
    const serverId = typeof entry === 'string' ? entry : entry.serverId;
    const perms = typeof entry === 'string' ? null : sanitizePermissions(entry.permissions);
    insert.run(userId, serverId, perms ? JSON.stringify(perms) : null);
  }
}

export function getUserServerAccessDetailed(userId: string): ServerAccessEntry[] {
  const rows = prep('SELECT server_id, permissions FROM user_server_access WHERE user_id = ?').all(userId) as {
    server_id: string;
    permissions: string | null;
  }[];
  return rows.map((r) => ({ serverId: r.server_id, permissions: r.permissions ? sanitizePermissions(JSON.parse(r.permissions)) : null }));
}

/** Effective permissions on one instance, or null when the user isn't assigned to it at all. */
export function getServerPermissions(userId: string, role: Role, serverId: string): ServerPermission[] | null {
  if (role === 'admin') return [...SERVER_PERMISSIONS];
  const row = prep('SELECT permissions FROM user_server_access WHERE user_id = ? AND server_id = ?').get(userId, serverId) as
    | { permissions: string | null }
    | undefined;
  if (!row) return null;
  if (!row.permissions) return roleDefaultPermissions(role);
  try {
    return sanitizePermissions(JSON.parse(row.permissions)) ?? roleDefaultPermissions(role);
  } catch {
    return roleDefaultPermissions(role);
  }
}

export function getUserServerAccess(userId: string): string[] {
  const rows = prep('SELECT server_id FROM user_server_access WHERE user_id = ?').all(
    userId
  ) as { server_id: string }[];
  return rows.map((r) => r.server_id);
}

export function userHasServerAccess(userId: string, serverId: string): boolean {
  const row = prep(
    'SELECT 1 FROM user_server_access WHERE user_id = ? AND server_id = ?'
  ).get(userId, serverId);
  return !!row;
}

export function logAudit(userId: string | null, username: string | null, action: string, target?: string, detail?: string) {
  prep(
    'INSERT INTO audit_log (user_id, username, action, target, detail) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, username, action, target ?? null, detail ?? null);
}
