import { Router } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { searchPlugins } from '../services/pluginRegistryService.js';

export const pluginRegistryRouter = Router();
pluginRegistryRouter.use(requireAuth);

/** Global plugin catalog search (Modrinth) — not tied to a specific server. */
pluginRegistryRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const limit = req.query.limit ? Number(req.query.limit) : 24;
    const catalog = req.query.catalog === 'datapack' ? 'datapack' : 'plugin';
    try {
      const results = await searchPlugins(query, limit, catalog);
      res.json({ results });
    } catch (err) {
      throw new HttpError(502, err instanceof Error ? err.message : 'Plugin search failed');
    }
  })
);
