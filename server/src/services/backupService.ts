import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { backupDir, instanceDir } from '../utils/paths.js';
import { isRunning } from './processManager.js';
import { HttpError } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export interface BackupInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Zips the entire instance directory into the server's backup folder. Skips old backup archives. */
export async function createBackup(serverId: string, label?: string): Promise<BackupInfo> {
  const srcDir = instanceDir(serverId);
  if (!fs.existsSync(srcDir)) throw new HttpError(404, 'Server directory not found');
  const destDir = backupDir(serverId);
  fs.mkdirSync(destDir, { recursive: true });

  const safeLabel = label ? '-' + label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) : '';
  const fileName = `backup-${timestampSlug()}${safeLabel}.zip`;
  const destPath = path.join(destDir, fileName);

  const zip = new AdmZip();
  zip.addLocalFolder(srcDir, '', (entryPath) => !entryPath.startsWith('..' + path.sep + 'backups'));
  await zip.writeZipPromise(destPath);

  const stat = fs.statSync(destPath);
  logger.info(`Created backup for server ${serverId}: ${fileName} (${stat.size} bytes)`);
  return { fileName, sizeBytes: stat.size, createdAt: new Date().toISOString() };
}

export function listBackups(serverId: string): BackupInfo[] {
  const dir = backupDir(serverId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.zip'))
    .map((fileName) => {
      const stat = fs.statSync(path.join(dir, fileName));
      return { fileName, sizeBytes: stat.size, createdAt: stat.birthtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resolveBackupPath(serverId: string, fileName: string): string {
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new HttpError(400, 'Invalid backup file name');
  }
  const filePath = path.join(backupDir(serverId), fileName);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'Backup not found');
  return filePath;
}

export function deleteBackup(serverId: string, fileName: string): void {
  const filePath = resolveBackupPath(serverId, fileName);
  fs.rmSync(filePath);
}

/** Restores a backup by wiping the current instance directory and extracting the archive in its place. */
export async function restoreBackup(serverId: string, fileName: string): Promise<void> {
  if (isRunning(serverId)) {
    throw new HttpError(409, 'Stop the server before restoring a backup');
  }
  const filePath = resolveBackupPath(serverId, fileName);
  const dir = instanceDir(serverId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zip = new AdmZip(filePath);
  zip.extractAllTo(dir, true);
  logger.info(`Restored server ${serverId} from backup ${fileName}`);
}

export function enforceRetention(serverId: string, retentionCount: number): void {
  const backups = listBackups(serverId);
  if (backups.length <= retentionCount) return;
  const toDelete = backups.slice(retentionCount);
  for (const b of toDelete) {
    fs.rmSync(path.join(backupDir(serverId), b.fileName), { force: true });
    logger.info(`Pruned old backup ${b.fileName} for server ${serverId} (retention ${retentionCount})`);
  }
}
