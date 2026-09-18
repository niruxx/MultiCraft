import { Router } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import {
  SETTING_STEAMCMD_SOURCE,
  clearSetting,
  getSystemSettings,
  setSetting,
} from '../services/systemSettingsService.js';
import { logAudit } from '../services/userService.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth, requireRole('admin'));

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(getSystemSettings());
  })
);

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { steamcmdSource } = req.body ?? {};
    if (steamcmdSource !== undefined) {
      if (typeof steamcmdSource !== 'string') throw new HttpError(400, 'steamcmdSource must be a string');
      if (steamcmdSource.trim()) {
        setSetting(SETTING_STEAMCMD_SOURCE, steamcmdSource.trim());
      } else {
        clearSetting(SETTING_STEAMCMD_SOURCE);
      }
    }
    logAudit(req.auth!.sub, req.auth!.username, 'settings.update');
    res.json(getSystemSettings());
  })
);
