import { Router } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import {
  addNode,
  getLocalNodeKey,
  listNodes,
  localNodeInfo,
  nodeStatus,
  regenerateLocalNodeKey,
  removeNode,
} from '../services/nodeService.js';
import { logAudit } from '../services/userService.js';

/** Admin management of the other MultiCraft panels this one can transfer instances to. */
export const nodesRouter = Router();
nodesRouter.use(requireAuth, requireRole('admin'));

nodesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ nodes: listNodes() });
  })
);

nodesRouter.get(
  '/local',
  asyncHandler(async (_req, res) => {
    res.json({ nodeKey: getLocalNodeKey(), info: localNodeInfo() });
  })
);

nodesRouter.post(
  '/local/regenerate',
  asyncHandler(async (req, res) => {
    const nodeKey = regenerateLocalNodeKey();
    logAudit(req.auth!.sub, req.auth!.username, 'node.key.regenerate');
    res.json({ nodeKey });
  })
);

nodesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, url, apiKey } = req.body ?? {};
    if (typeof name !== 'string' || typeof url !== 'string' || typeof apiKey !== 'string') {
      throw new HttpError(400, 'name, url and apiKey are required');
    }
    const result = await addNode(name, url, apiKey);
    logAudit(req.auth!.sub, req.auth!.username, 'node.add', result.node.id, result.node.url);
    res.status(201).json(result);
  })
);

nodesRouter.get(
  '/:nodeId/status',
  asyncHandler(async (req, res) => {
    res.json(await nodeStatus(req.params.nodeId));
  })
);

nodesRouter.delete(
  '/:nodeId',
  asyncHandler(async (req, res) => {
    removeNode(req.params.nodeId);
    logAudit(req.auth!.sub, req.auth!.username, 'node.remove', req.params.nodeId);
    res.status(204).end();
  })
);
