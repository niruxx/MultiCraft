import { Router, type Request } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireServerAccess } from '../auth/middleware.js';
import {
  createBackup,
  deleteBackup,
  listBackups,
  resolveBackupPath,
  restoreBackup,
} from '../services/backupService.js';
import { getSchedule, removeSchedule, setSchedule } from '../services/schedulerService.js';
import { logAudit } from '../services/userService.js';
import type { Role } from '../types/index.js';

export const backupsRouter = Router({ mergeParams: true });
backupsRouter.use(requireAuth, requireServerAccess());

function canWrite(role: Role): boolean {
  return role === 'admin' || role === 'moderator';
}

function requireWrite(req: Request) {
  if (!canWrite(req.auth!.role)) throw new HttpError(403, 'Viewers cannot manage backups');
}

backupsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ backups: listBackups(req.params.serverId) });
  })
);

backupsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const backup = await createBackup(req.params.serverId, req.body?.label);
    logAudit(req.auth!.sub, req.auth!.username, 'backup.create', req.params.serverId, backup.fileName);
    res.status(201).json({ backup });
  })
);

backupsRouter.get(
  '/:fileName/download',
  asyncHandler(async (req, res) => {
    const filePath = resolveBackupPath(req.params.serverId, req.params.fileName);
    res.download(filePath, req.params.fileName);
  })
);

backupsRouter.post(
  '/:fileName/restore',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    await restoreBackup(req.params.serverId, req.params.fileName);
    logAudit(req.auth!.sub, req.auth!.username, 'backup.restore', req.params.serverId, req.params.fileName);
    res.json({ ok: true });
  })
);

backupsRouter.delete(
  '/:fileName',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    deleteBackup(req.params.serverId, req.params.fileName);
    logAudit(req.auth!.sub, req.auth!.username, 'backup.delete', req.params.serverId, req.params.fileName);
    res.status(204).end();
  })
);

backupsRouter.get(
  '/schedule',
  asyncHandler(async (req, res) => {
    res.json({ schedule: getSchedule(req.params.serverId) ?? null });
  })
);

backupsRouter.put(
  '/schedule',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const { cronExpression, retentionCount, enabled } = req.body ?? {};
    if (typeof cronExpression !== 'string' || !cronExpression) {
      throw new HttpError(400, 'cronExpression is required');
    }
    const schedule = setSchedule(
      req.params.serverId,
      cronExpression,
      Number(retentionCount) || 5,
      enabled !== false
    );
    logAudit(req.auth!.sub, req.auth!.username, 'backup.schedule.set', req.params.serverId, cronExpression);
    res.json({ schedule });
  })
);

backupsRouter.delete(
  '/schedule',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    removeSchedule(req.params.serverId);
    res.status(204).end();
  })
);
