import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { DATA_DIR } from '../utils/paths.js';
import { closeDatabase } from '../db/db.js';
import { listServers } from './serverService.js';
import { isRunning } from './processManager.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/asyncHandler.js';

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Renames a directory, retrying a few times on Windows' transient EPERM/EBUSY — antivirus or
 * the search indexer can briefly hold a handle into a directory right after it's created or
 * freed, which makes an immediate rename fail even though nothing is actually still using it.
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250 * i));
    }
  }
}

/**
 * Zips the entire data directory (database, every server's files, and all backups) to a
 * temp file outside of DATA_DIR (so the zip never tries to include itself). Caller is
 * responsible for streaming it to the client and deleting it afterward.
 */
export async function exportEnvironment(): Promise<{ filePath: string; fileName: string }> {
  const fileName = `multicraft-environment-${timestampSlug()}.zip`;
  const filePath = path.join(os.tmpdir(), fileName);
  const zip = new AdmZip();
  zip.addLocalFolder(DATA_DIR, '');
  await zip.writeZipPromise(filePath);
  logger.info(`Exported environment backup: ${filePath} (${fs.statSync(filePath).size} bytes)`);
  return { filePath, fileName };
}

/** Checks that an uploaded archive actually looks like a MultiCraft data directory export. */
export function validateEnvironmentArchive(zipPath: string): void {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new HttpError(400, 'That file is not a valid zip archive');
  }
  const hasDb = zip.getEntries().some((e) => e.entryName === 'multicraft.db' || e.entryName === 'multicraft.db/');
  if (!hasDb) {
    throw new HttpError(400, "This doesn't look like a MultiCraft environment backup (no multicraft.db found in the archive)");
  }
}

/** Ensures it's safe to yank the whole data directory out from under the running process. */
export function assertNoServersRunning(): void {
  const running = listServers().filter((s) => isRunning(s.id));
  if (running.length > 0) {
    throw new HttpError(
      409,
      `Stop all running servers before importing (still running: ${running.map((s) => s.name).join(', ')})`
    );
  }
}

/**
 * Replaces the entire data directory with the contents of an uploaded archive, then exits
 * the process so the next start reopens a fresh database against the restored files. The
 * previous data directory is kept alongside (renamed, not deleted) as a safety net.
 *
 * Callers MUST have already validated the archive and confirmed no servers are running.
 */
export async function importEnvironment(zipPath: string): Promise<{ previousDataDirBackup: string }> {
  const stagingDir = `${DATA_DIR}-import-staging-${timestampSlug()}`;
  const preImportBackupDir = `${DATA_DIR}-pre-import-${timestampSlug()}`;

  fs.mkdirSync(stagingDir, { recursive: true });
  try {
    new AdmZip(zipPath).extractAllTo(stagingDir, true);
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw new HttpError(400, `Could not extract the archive (${err instanceof Error ? err.message : err})`);
  }

  // Point of no return: node:sqlite can't reopen a closed database, so once we close it the
  // app can no longer serve normal requests (or a normal HTTP error response) regardless of
  // whether the file swap below succeeds. Any failure from here on is handled by restoring
  // the original files as best we can and forcing a restart, rather than returning an error.
  closeDatabase();

  try {
    await renameWithRetry(DATA_DIR, preImportBackupDir);
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    logger.error('Environment import failed before any files were touched; restarting to recover', err);
    process.exit(1);
  }

  try {
    await renameWithRetry(stagingDir, DATA_DIR);
  } catch (err) {
    await renameWithRetry(preImportBackupDir, DATA_DIR).catch((rollbackErr) => {
      logger.error('CRITICAL: import rollback failed, data directory may be missing', rollbackErr);
    });
    fs.rmSync(stagingDir, { recursive: true, force: true });
    logger.error('Environment import failed applying new files; rolled back and restarting to recover', err);
    process.exit(1);
  }

  logger.info(`Environment import applied. Previous data kept at ${preImportBackupDir}`);
  return { previousDataDirBackup: preImportBackupDir };
}
