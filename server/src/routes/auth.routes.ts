import { Router } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { createToken } from '../auth/tokens.js';
import { authenticate, countUsers, createUser, getUserById, logAudit } from '../services/userService.js';

export const authRouter = Router();

authRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ setupRequired: countUsers() === 0 });
  })
);

// First-run only: creates the initial admin account. Locked out once any user exists.
authRouter.post(
  '/setup',
  asyncHandler(async (req, res) => {
    if (countUsers() > 0) throw new HttpError(409, 'Setup has already been completed');
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || username.trim().length < 3) {
      throw new HttpError(400, 'Username must be at least 3 characters');
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }
    const user = createUser(username.trim(), password, 'admin');
    logAudit(user.id, user.username, 'setup.create_admin');
    const token = createToken(user.id, user.username, user.role);
    res.json({ token, user });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new HttpError(400, 'Username and password are required');
    }
    const user = authenticate(username.trim(), password);
    if (!user) throw new HttpError(401, 'Invalid username or password');
    const token = createToken(user.id, user.username, user.role);
    logAudit(user.id, user.username, 'auth.login');
    res.json({ token, user });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getUserById(req.auth!.sub);
    if (!user) throw new HttpError(401, 'Session no longer valid');
    const { password_hash, password_salt, ...publicUser } = user;
    res.json({ user: publicUser });
  })
);
