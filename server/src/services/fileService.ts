import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { instanceDir, safeJoin } from '../utils/paths.js';
import { HttpError } from '../utils/asyncHandler.js';

const MAX_TEXT_EDIT_BYTES = 5 * 1024 * 1024; // 5 MB safety cap for the in-browser text editor

export interface FileEntry {
  name: string;
  path: string; // relative to the server's instance directory, forward-slash separated
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

function resolvePath(serverId: string, relativePath: string): string {
  try {
    return safeJoin(instanceDir(serverId), relativePath);
  } catch {
    throw new HttpError(400, 'Invalid path');
  }
}

function toRelative(base: string, absolute: string): string {
  return path.relative(base, absolute).split(path.sep).join('/');
}

export async function listDirectory(serverId: string, relativePath: string): Promise<FileEntry[]> {
  const base = instanceDir(serverId);
  const target = resolvePath(serverId, relativePath);
  const entries = await fsp.readdir(target, { withFileTypes: true });
  const results: FileEntry[] = [];
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    let stat;
    try {
      stat = await fsp.stat(full);
    } catch {
      continue; // broken symlink or race with deletion
    }
    results.push({
      name: entry.name,
      path: toRelative(base, full),
      isDirectory: entry.isDirectory(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  results.sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
  return results;
}

export async function readTextFile(serverId: string, relativePath: string): Promise<string> {
  const target = resolvePath(serverId, relativePath);
  const stat = await fsp.stat(target);
  if (stat.isDirectory()) throw new HttpError(400, 'Cannot read a directory as a file');
  if (stat.size > MAX_TEXT_EDIT_BYTES) {
    throw new HttpError(413, 'File is too large to edit in the browser (limit 5 MB). Download it instead.');
  }
  return fsp.readFile(target, 'utf8');
}

export async function writeTextFile(serverId: string, relativePath: string, content: string): Promise<void> {
  const target = resolvePath(serverId, relativePath);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, content, 'utf8');
}

export async function createDirectory(serverId: string, relativePath: string): Promise<void> {
  const target = resolvePath(serverId, relativePath);
  await fsp.mkdir(target, { recursive: true });
}

export async function deleteEntry(serverId: string, relativePath: string): Promise<void> {
  if (relativePath === '' || relativePath === '.' || relativePath === '/') {
    throw new HttpError(400, 'Refusing to delete the server root directory');
  }
  const target = resolvePath(serverId, relativePath);
  await fsp.rm(target, { recursive: true, force: true });
}

export async function renameEntry(serverId: string, fromPath: string, toPath: string): Promise<void> {
  const from = resolvePath(serverId, fromPath);
  const to = resolvePath(serverId, toPath);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  await fsp.rename(from, to);
}

export function resolveForDownload(serverId: string, relativePath: string): string {
  const target = resolvePath(serverId, relativePath);
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    throw new HttpError(404, 'File not found');
  }
  return target;
}

export function resolveForUpload(serverId: string, relativeDir: string): string {
  const target = resolvePath(serverId, relativeDir);
  fs.mkdirSync(target, { recursive: true });
  return target;
}
