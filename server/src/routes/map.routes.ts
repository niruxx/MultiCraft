import { Router, type Request } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireServerAccess } from '../auth/middleware.js';
import { getServer } from '../services/serverService.js';
import { getMapImagePath, getMapMeta, isMapCapable, renderMap } from '../services/mapService.js';
import { appendLine } from '../services/consoleLogService.js';
import { logAudit } from '../services/userService.js';
import type { Role } from '../types/index.js';

export const mapRouter = Router({ mergeParams: true });
mapRouter.use(requireAuth, requireServerAccess());

function canWrite(role: Role): boolean {
  return role === 'admin' || role === 'moderator';
}

function requireWrite(req: Request) {
  if (!canWrite(req.auth!.role)) throw new HttpError(403, 'Viewers cannot render maps');
}

mapRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    res.json({ capable: isMapCapable(server.loader), meta: getMapMeta(server.id) });
  })
);

mapRouter.get(
  '/image',
  asyncHandler(async (req, res) => {
    res.sendFile(getMapImagePath(req.params.serverId));
  })
);

mapRouter.post(
  '/render',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');

    appendLine(server.id, `[MultiCraft] Rendering map for "${server.name}" (requested by ${req.auth!.username})`);
    try {
      const meta = await renderMap(server, (line) => appendLine(server.id, line));
      logAudit(req.auth!.sub, req.auth!.username, 'map.render', server.id);
      res.json({ meta });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendLine(server.id, `[MultiCraft] Map render failed: ${message}`, 'stderr');
      throw err;
    }
  })
);
