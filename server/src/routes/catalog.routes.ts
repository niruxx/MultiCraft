import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { BLANK_CONTAINER, CATALOG } from '../services/catalogService.js';

/** The app/container template catalog shown in "New instance". */
export const catalogRouter = Router();
catalogRouter.use(requireAuth);

catalogRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ entries: CATALOG, blank: BLANK_CONTAINER });
  })
);
