import { Router, type Request } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireServerAccess } from '../auth/middleware.js';
import { getServer } from '../services/serverService.js';
import { isRunning, sendCommand } from '../services/processManager.js';
import {
  addToWhitelistFile,
  getWhitelistState,
  removeFromWhitelistFile,
  setWhitelistEnabled,
  whitelistCommand,
} from '../services/whitelistService.js';
import { logAudit } from '../services/userService.js';
import type { Role } from '../types/index.js';

export const whitelistRouter = Router({ mergeParams: true });
whitelistRouter.use(requireAuth, requireServerAccess());

function canWrite(role: Role): boolean {
  return role === 'admin' || role === 'moderator';
}

function requireWrite(req: Request) {
  if (!canWrite(req.auth!.role)) throw new HttpError(403, 'Viewers cannot manage the allowlist');
}

function requireServer(serverId: string) {
  const server = getServer(serverId);
  if (!server) throw new HttpError(404, 'Server not found');
  return server;
}

whitelistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const server = requireServer(req.params.serverId);
    res.json({ ...getWhitelistState(server.id, server.platform), running: isRunning(server.id) });
  })
);

whitelistRouter.put(
  '/enabled',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = requireServer(req.params.serverId);
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
    setWhitelistEnabled(server.id, server.platform, enabled);
    if (isRunning(server.id)) sendCommand(server.id, `${whitelistCommand(server.platform)} ${enabled ? 'on' : 'off'}`);
    logAudit(req.auth!.sub, req.auth!.username, 'whitelist.toggle', server.id, String(enabled));
    res.json(getWhitelistState(server.id, server.platform));
  })
);

whitelistRouter.post(
  '/players',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = requireServer(req.params.serverId);
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Player name is required');
    const trimmed = name.trim();

    if (isRunning(server.id)) {
      sendCommand(server.id, `${whitelistCommand(server.platform)} add ${trimmed}`);
    } else {
      await addToWhitelistFile(server.id, server.platform, trimmed);
    }
    logAudit(req.auth!.sub, req.auth!.username, 'whitelist.add', server.id, trimmed);
    res.status(201).json(getWhitelistState(server.id, server.platform));
  })
);

whitelistRouter.delete(
  '/players/:name',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = requireServer(req.params.serverId);
    const name = req.params.name;

    if (isRunning(server.id)) {
      sendCommand(server.id, `${whitelistCommand(server.platform)} remove ${name}`);
    } else {
      removeFromWhitelistFile(server.id, server.platform, name);
    }
    logAudit(req.auth!.sub, req.auth!.username, 'whitelist.remove', server.id, name);
    res.json(getWhitelistState(server.id, server.platform));
  })
);
