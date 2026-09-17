import os from 'node:os';
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { findJava, getJavaVersion } from '../services/javaService.js';

export const systemRouter = Router();
systemRouter.use(requireAuth);

/** Lets the UI show a small "what host is this panel running on" indicator. */
systemRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [javaPath, javaVersion] = await Promise.all([findJava(), getJavaVersion()]);
    res.json({
      platform: process.platform, // 'win32' | 'linux' | 'darwin'
      platformLabel: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
      arch: process.arch,
      hostname: os.hostname(),
      nodeVersion: process.version,
      java: { available: !!javaPath, version: javaVersion },
    });
  })
);
