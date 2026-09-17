import { Router } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import {
  createUser,
  deleteUser,
  getUserById,
  getUserServerAccess,
  listUsers,
  logAudit,
  setUserServerAccess,
  updateUserPassword,
  updateUserRole,
} from '../services/userService.js';
import type { Role } from '../types/index.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('admin'));

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = listUsers().map((u) => ({ ...u, serverAccess: getUserServerAccess(u.id) }));
    res.json({ users });
  })
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { username, password, role } = req.body ?? {};
    if (typeof username !== 'string' || username.trim().length < 3) {
      throw new HttpError(400, 'Username must be at least 3 characters');
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }
    if (!['admin', 'moderator', 'viewer'].includes(role)) {
      throw new HttpError(400, 'Role must be admin, moderator, or viewer');
    }
    const user = createUser(username.trim(), password, role as Role);
    logAudit(req.auth!.sub, req.auth!.username, 'user.create', user.id, `role=${role}`);
    res.status(201).json({ user });
  })
);

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const target = getUserById(req.params.id);
    if (!target) throw new HttpError(404, 'User not found');
    const { role, password, serverAccess } = req.body ?? {};

    if (role !== undefined) {
      if (!['admin', 'moderator', 'viewer'].includes(role)) {
        throw new HttpError(400, 'Invalid role');
      }
      if (target.id === req.auth!.sub && role !== 'admin') {
        throw new HttpError(400, 'You cannot demote your own account');
      }
      updateUserRole(target.id, role);
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        throw new HttpError(400, 'Password must be at least 8 characters');
      }
      updateUserPassword(target.id, password);
    }
    if (Array.isArray(serverAccess)) {
      setUserServerAccess(target.id, serverAccess.filter((s) => typeof s === 'string'));
    }
    logAudit(req.auth!.sub, req.auth!.username, 'user.update', target.id);
    res.json({ user: getUserById(target.id) });
  })
);

usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.auth!.sub) throw new HttpError(400, 'You cannot delete your own account');
    const target = getUserById(req.params.id);
    if (!target) throw new HttpError(404, 'User not found');
    deleteUser(target.id);
    logAudit(req.auth!.sub, req.auth!.username, 'user.delete', target.id);
    res.status(204).end();
  })
);
