import { Router, type Request } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireServerAccess } from '../auth/middleware.js';
import { getServer } from '../services/serverService.js';
import { deletePlugin, installPluginFile, isPluginCapable, listPlugins, setPluginEnabled } from '../services/pluginService.js';
import { resolvePluginVersion } from '../services/pluginRegistryService.js';
import { appendLine } from '../services/consoleLogService.js';
import { logAudit } from '../services/userService.js';
import type { Role, ServerRecord } from '../types/index.js';

export const pluginsRouter = Router({ mergeParams: true });
pluginsRouter.use(requireAuth, requireServerAccess());

function canWrite(role: Role): boolean {
  return role === 'admin' || role === 'moderator';
}

function requireWrite(req: Request) {
  if (!canWrite(req.auth!.role)) throw new HttpError(403, 'Viewers cannot manage plugins');
}

function requirePluginCapableServer(serverId: string): ServerRecord {
  const server = getServer(serverId);
  if (!server) throw new HttpError(404, 'Server not found');
  if (!isPluginCapable(server.loader)) {
    throw new HttpError(400, `${server.loader} servers do not support plugins (Paper, Purpur, and Spigot do)`);
  }
  return server;
}

pluginsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const server = requirePluginCapableServer(req.params.serverId);
    res.json({ plugins: listPlugins(server.id) });
  })
);

pluginsRouter.post(
  '/install',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = requirePluginCapableServer(req.params.serverId);
    const { slug } = req.body ?? {};
    if (typeof slug !== 'string' || !slug.trim()) throw new HttpError(400, 'slug is required');

    appendLine(server.id, `[MultiCraft] Resolving plugin "${slug}" for ${server.loader} ${server.version}`);
    const resolved = await resolvePluginVersion(slug.trim(), server.loader, server.version).catch((err) => {
      appendLine(server.id, `[MultiCraft] Plugin resolve failed: ${err.message}`, 'stderr');
      throw new HttpError(502, err instanceof Error ? err.message : 'Could not resolve plugin version');
    });
    if (resolved.versionMismatchWarning) {
      appendLine(
        server.id,
        `[MultiCraft] No build listed for Minecraft ${server.version} — installing the latest available build (${resolved.versionNumber}) instead. Check it's compatible.`
      );
    }
    appendLine(server.id, `[MultiCraft] Downloading plugin ${resolved.fileName} (${resolved.versionNumber})`);
    await installPluginFile(server.id, resolved.downloadUrl, resolved.fileName, (line) => appendLine(server.id, line));
    appendLine(server.id, `[MultiCraft] Installed ${resolved.fileName} — restart the server for it to load`);

    logAudit(req.auth!.sub, req.auth!.username, 'plugin.install', server.id, resolved.fileName);
    res.status(201).json({ plugins: listPlugins(server.id), resolved });
  })
);

pluginsRouter.post(
  '/:fileName/toggle',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = requirePluginCapableServer(req.params.serverId);
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
    setPluginEnabled(server.id, req.params.fileName, enabled);
    logAudit(req.auth!.sub, req.auth!.username, 'plugin.toggle', server.id, `${req.params.fileName}=${enabled}`);
    res.json({ plugins: listPlugins(server.id) });
  })
);

pluginsRouter.delete(
  '/:fileName',
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = requirePluginCapableServer(req.params.serverId);
    deletePlugin(server.id, req.params.fileName);
    logAudit(req.auth!.sub, req.auth!.username, 'plugin.delete', server.id, req.params.fileName);
    res.status(204).end();
  })
);
