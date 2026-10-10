import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './tokens.js';
import type { AuthTokenPayload, Role } from '../types/index.js';
import { getServerPermissions, userHasServerAccess, type ServerPermission } from '../services/userService.js';
import { HttpError } from '../utils/asyncHandler.js';
import { getServer } from '../services/serverService.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' });
  req.auth = payload;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/** Admins and moderators/viewers with explicit access may proceed; others are blocked. */
export function requireServerAccess(paramName = 'serverId') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
    const serverId = req.params[paramName];
    if (req.auth.role === 'admin') return next();
    if (!userHasServerAccess(req.auth.sub, serverId)) {
      return res.status(403).json({ error: 'You do not have access to this server' });
    }
    // Suspended instances are locked to everyone but admins — files, console, backups, plugins,
    // everything server-scoped goes through this check.
    const server = getServer(serverId);
    if (server?.suspended) {
      return res.status(423).json({ error: suspendedMessage(server.suspended_reason), suspended: true });
    }
    next();
  };
}

export function suspendedMessage(reason: string | null): string {
  return `This instance is suspended${reason ? `: ${reason}` : ''}. Contact the panel owner.`;
}

const PERMISSION_LABEL: Record<ServerPermission, string> = {
  power: 'Start / stop',
  console: 'Console commands',
  'files.read': 'View files',
  'files.write': 'Edit files',
  'backups.create': 'Create snapshots',
  'backups.restore': 'Restore snapshots',
  plugins: 'Manage plugins',
  players: 'Manage players',
  settings: 'Edit configuration',
  update: 'Update server',
  launch: 'Edit launch command',
  network: 'Manage UPnP port forwarding',
};

/** Throws 403 unless the signed-in user holds `permission` on the instance in the route. */
export function requirePermission(req: Request, permission: ServerPermission, serverId: string = req.params.serverId) {
  const perms = getServerPermissions(req.auth!.sub, req.auth!.role, serverId);
  if (!perms?.includes(permission)) {
    throw new HttpError(403, `You don't have the "${PERMISSION_LABEL[permission]}" permission on this instance`);
  }
}
