import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './tokens.js';
import type { AuthTokenPayload, Role } from '../types/index.js';
import { userHasServerAccess } from '../services/userService.js';

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
    if (req.auth.role === 'admin' || userHasServerAccess(req.auth.sub, serverId)) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have access to this server' });
  };
}
