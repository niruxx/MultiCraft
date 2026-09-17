import { Router, type Request } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireServerAccess } from '../auth/middleware.js';
import {
  createDirectory,
  deleteEntry,
  listDirectory,
  readTextFile,
  renameEntry,
  resolveForDownload,
  resolveForUpload,
  writeTextFile,
} from '../services/fileService.js';
import { logAudit } from '../services/userService.js';
import type { Role } from '../types/index.js';

export const filesRouter = Router({ mergeParams: true });
filesRouter.use(requireAuth, requireServerAccess());

function canWrite(role: Role): boolean {
  return role === 'admin' || role === 'moderator';
}

function requireWrite(req: Request) {
  if (!canWrite(req.auth!.role)) throw new HttpError(403, 'Viewers cannot modify files');
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

filesRouter.get(
  '/list',
  asyncHandler(async (req, res) => {
    const dir = typeof req.query.path === 'string' ? req.query.path : '';
    res.json({ entries: await listDirectory(req.params.serverId, dir) });
  })
);

filesRouter.get(
  '/content',
  asyncHandler(async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path : '';
    res.json({ content: await readTextFile(req.params.serverId, filePath) });
  })
);

filesRouter.put(
  '/content',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const { path: filePath, content } = req.body ?? {};
    if (typeof filePath !== 'string' || typeof content !== 'string') {
      throw new HttpError(400, 'path and content are required');
    }
    await writeTextFile(req.params.serverId, filePath, content);
    logAudit(req.auth!.sub, req.auth!.username, 'file.write', req.params.serverId, filePath);
    res.json({ ok: true });
  })
);

filesRouter.post(
  '/mkdir',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const { path: dirPath } = req.body ?? {};
    if (typeof dirPath !== 'string' || !dirPath) throw new HttpError(400, 'path is required');
    await createDirectory(req.params.serverId, dirPath);
    res.status(201).json({ ok: true });
  })
);

filesRouter.post(
  '/rename',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const { from, to } = req.body ?? {};
    if (typeof from !== 'string' || typeof to !== 'string') throw new HttpError(400, 'from and to are required');
    await renameEntry(req.params.serverId, from, to);
    logAudit(req.auth!.sub, req.auth!.username, 'file.rename', req.params.serverId, `${from} -> ${to}`);
    res.json({ ok: true });
  })
);

filesRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const filePath = typeof req.query.path === 'string' ? req.query.path : '';
    await deleteEntry(req.params.serverId, filePath);
    logAudit(req.auth!.sub, req.auth!.username, 'file.delete', req.params.serverId, filePath);
    res.status(204).end();
  })
);

filesRouter.get(
  '/download',
  asyncHandler(async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path : '';
    const target = resolveForDownload(req.params.serverId, filePath);
    res.download(target, path.basename(target));
  })
);

filesRouter.post(
  '/upload',
  upload.array('files'),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const dirPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const targetDir = resolveForUpload(req.params.serverId, dirPath);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    for (const file of files) {
      fs.writeFileSync(path.join(targetDir, file.originalname), file.buffer);
    }
    logAudit(req.auth!.sub, req.auth!.username, 'file.upload', req.params.serverId, `${files.length} file(s) -> ${dirPath}`);
    res.status(201).json({ uploaded: files.map((f) => f.originalname) });
  })
);
