import cron, { type ScheduledTask } from 'node-cron';
import { prep } from '../db/db.js';
import { createBackup, enforceRetention } from './backupService.js';
import type { BackupSchedule } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/asyncHandler.js';

const activeTasks = new Map<string, ScheduledTask>();

export function getSchedule(serverId: string): BackupSchedule | undefined {
  return prep('SELECT * FROM backup_schedules WHERE server_id = ?').get(serverId) as
    | BackupSchedule
    | undefined;
}

function registerTask(schedule: BackupSchedule) {
  activeTasks.get(schedule.server_id)?.stop();
  if (!schedule.enabled) return;
  const task = cron.schedule(schedule.cron_expression, async () => {
    try {
      logger.info(`Running scheduled backup for server ${schedule.server_id}`);
      await createBackup(schedule.server_id, 'auto');
      enforceRetention(schedule.server_id, schedule.retention_count);
    } catch (err) {
      logger.error(`Scheduled backup failed for server ${schedule.server_id}`, err);
    }
  });
  activeTasks.set(schedule.server_id, task);
}

export function setSchedule(
  serverId: string,
  cronExpression: string,
  retentionCount: number,
  enabled: boolean
): BackupSchedule {
  if (!cron.validate(cronExpression)) {
    throw new HttpError(400, `Invalid cron expression: ${cronExpression}`);
  }
  prep(
    `INSERT INTO backup_schedules (server_id, cron_expression, retention_count, enabled)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(server_id) DO UPDATE SET cron_expression = excluded.cron_expression,
       retention_count = excluded.retention_count, enabled = excluded.enabled`
  ).run(serverId, cronExpression, retentionCount, enabled ? 1 : 0);
  const schedule = getSchedule(serverId)!;
  registerTask(schedule);
  return schedule;
}

export function removeSchedule(serverId: string): void {
  activeTasks.get(serverId)?.stop();
  activeTasks.delete(serverId);
  prep('DELETE FROM backup_schedules WHERE server_id = ?').run(serverId);
}

/** Loads all persisted schedules and starts their cron jobs. Call once at boot. */
export function initScheduler(): void {
  const schedules = prep('SELECT * FROM backup_schedules').all() as unknown as BackupSchedule[];
  for (const schedule of schedules) registerTask(schedule);
  logger.info(`Scheduler initialized with ${schedules.length} backup schedule(s)`);
}
