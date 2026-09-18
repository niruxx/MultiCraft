import fs from 'node:fs';
import crypto from 'node:crypto';
import { prep } from '../db/db.js';
import { instanceDir, backupDir } from '../utils/paths.js';
import type { Loader, Platform, ServerRecord, ServerStatus } from '../types/index.js';

export interface CreateServerInput {
  name: string;
  platform: Platform;
  loader: Loader;
  version: string;
  minMemoryMb: number;
  maxMemoryMb: number;
  serverPort: number;
  extraJavaArgs?: string;
  extraArgs?: string;
  createdBy: string;
  steamAppId?: string | null;
  steamLogin?: string;
  steamExtraFlags?: string;
}

export function createServerRecord(input: CreateServerInput): ServerRecord {
  const id = crypto.randomUUID();
  fs.mkdirSync(instanceDir(id), { recursive: true });
  fs.mkdirSync(backupDir(id), { recursive: true });
  prep(
    `INSERT INTO servers
      (id, name, platform, loader, version, min_memory_mb, max_memory_mb, server_port, extra_java_args, extra_args, status, created_by, steam_app_id, steam_login, steam_extra_flags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'installing', ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.platform,
    input.loader,
    input.version,
    input.minMemoryMb,
    input.maxMemoryMb,
    input.serverPort,
    input.extraJavaArgs ?? '',
    input.extraArgs ?? '',
    input.createdBy,
    input.steamAppId ?? null,
    input.steamLogin ?? 'anonymous',
    input.steamExtraFlags ?? ''
  );
  return getServer(id)!;
}

export function getServer(id: string): ServerRecord | undefined {
  return prep('SELECT * FROM servers WHERE id = ?').get(id) as ServerRecord | undefined;
}

export function listServers(): ServerRecord[] {
  return prep('SELECT * FROM servers ORDER BY created_at ASC').all() as unknown as ServerRecord[];
}

export function setServerStatus(id: string, status: ServerStatus) {
  prep('UPDATE servers SET status = ? WHERE id = ?').run(status, id);
}

export function setServerJar(id: string, jarFile: string, build: string | null) {
  prep('UPDATE servers SET jar_file = ?, build = ? WHERE id = ?').run(jarFile, build, id);
}

/** Used after an in-place update, where the Minecraft version and/or jar/build may have changed. */
export function setServerVersion(id: string, version: string, jarFile: string | null, build: string | null) {
  prep('UPDATE servers SET version = ?, jar_file = COALESCE(?, jar_file), build = ? WHERE id = ?').run(
    version,
    jarFile,
    build,
    id
  );
}

export interface UpdateServerInput {
  name?: string;
  minMemoryMb?: number;
  maxMemoryMb?: number;
  serverPort?: number;
  extraJavaArgs?: string;
  extraArgs?: string;
  autoStart?: boolean;
  steamLogin?: string;
  steamExtraFlags?: string;
}

export function updateServerRecord(id: string, input: UpdateServerInput) {
  const current = getServer(id);
  if (!current) throw new Error('Server not found');
  prep(
    `UPDATE servers SET
      name = ?, min_memory_mb = ?, max_memory_mb = ?, server_port = ?,
      extra_java_args = ?, extra_args = ?, auto_start = ?, steam_login = ?, steam_extra_flags = ?
     WHERE id = ?`
  ).run(
    input.name ?? current.name,
    input.minMemoryMb ?? current.min_memory_mb,
    input.maxMemoryMb ?? current.max_memory_mb,
    input.serverPort ?? current.server_port,
    input.extraJavaArgs ?? current.extra_java_args,
    input.extraArgs ?? current.extra_args,
    input.autoStart === undefined ? current.auto_start : input.autoStart ? 1 : 0,
    input.steamLogin ?? current.steam_login,
    input.steamExtraFlags ?? current.steam_extra_flags,
    id
  );
}

export function deleteServerRecord(id: string) {
  prep('DELETE FROM servers WHERE id = ?').run(id);
  fs.rmSync(instanceDir(id), { recursive: true, force: true });
  fs.rmSync(backupDir(id), { recursive: true, force: true });
}
