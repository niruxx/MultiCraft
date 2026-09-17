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

export function setUserServerAccess(userId: string, serverIds: string[]) {
  const tx = db.prepare('DELETE FROM user_server_access WHERE user_id = ?');
  tx.run(userId);
  const insert = prep('INSERT OR IGNORE INTO user_server_access (user_id, server_id) VALUES (?, ?)');
  for (const serverId of serverIds) insert.run(userId, serverId);
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
