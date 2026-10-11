import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { engineCounts, engineSocket, getEngineStatus, listManagedContainers } from '../services/containerService.js';

/** Container engine status for the Docker page. Container details are admin-only. */
export const dockerRouter = Router();
dockerRouter.use(requireAuth);

dockerRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const engine = getEngineStatus(req.query.refresh === '1');
    const isAdmin = req.auth!.role === 'admin';
    res.json({
      engine,
      counts: engine.available && isAdmin ? engineCounts() : null,
      containers: engine.available && isAdmin ? listManagedContainers() : [],
      socket: engine.available && isAdmin ? engineSocket() : null,
    });
  })
);
