import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requirePermission, requireServerAccess } from '../auth/middleware.js';
import { getServer } from '../services/serverService.js';
import {
  deletePlugin,
  getAddonSupport,
  installPluginFile,
  installUploadedAddon,
  listPlugins,
  requireAddonProfile,
  setPluginEnabled,
} from '../services/pluginService.js';
import { resolvePluginVersion } from '../services/pluginRegistryService.js';
import { appendLine } from '../services/consoleLogService.js';
import { logAudit } from '../services/userService.js';
import type { ServerRecord } from '../types/index.js';

export const pluginsRouter = Router({ mergeParams: true });
pluginsRouter.use(requireAuth, requireServerAccess());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });


function requireServer(serverId: string): ServerRecord {
  const server = getServer(serverId);
  if (!server) throw new HttpError(404, 'Server not found');
  return server;
}

/** Always 200: unsupported instance types get `support.supported = false` plus the reason, so the
 *  UI can explain what (if anything) that game supports instead of showing an error. */
pluginsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const server = requireServer(req.params.serverId);
    const support = getAddonSupport(server);
    res.json({ support, plugins: support.supported ? listPlugins(server) : [] });
  })
);

pluginsRouter.post(
  '/install',
  asyncHandler(async (req, res) => {
    requirePermission(req, 'plugins');
    const server = requireServer(req.params.serverId);
    const profile = requireAddonProfile(server);
    if (!profile.catalog) throw new HttpError(400, `${profile.label} for this instance can only be uploaded, not installed from a catalog`);
    const { slug } = req.body ?? {};
    if (typeof slug !== 'string' || !slug.trim()) throw new HttpError(400, 'slug is required');

    appendLine(server.id, `[MultiCraft] Resolving ${profile.singular} "${slug}" for ${server.loader} ${server.version}`);
    const resolved = await resolvePluginVersion(slug.trim(), profile.catalog, server.version).catch((err) => {
      appendLine(server.id, `[MultiCraft] ${profile.singular} resolve failed: ${err.message}`, 'stderr');
      throw new HttpError(502, err instanceof Error ? err.message : 'Could not resolve version');
    });
    if (resolved.versionMismatchWarning) {
      appendLine(
        server.id,
        `[MultiCraft] No build listed for Minecraft ${server.version} — installing the latest available build (${resolved.versionNumber}) instead. Check it's compatible.`
      );
    }
    appendLine(server.id, `[MultiCraft] Downloading ${resolved.fileName} (${resolved.versionNumber})`);
    await installPluginFile(server, resolved.downloadUrl, resolved.fileName, (line) => appendLine(server.id, line));
    appendLine(server.id, `[MultiCraft] Installed ${resolved.fileName} — restart the server for it to load`);

    logAudit(req.auth!.sub, req.auth!.username, 'plugin.install', server.id, resolved.fileName);
    res.status(201).json({ plugins: listPlugins(server), resolved });
  })
);

pluginsRouter.post(
  '/upload',
  upload.array('files'),
  asyncHandler(async (req, res) => {
    requirePermission(req, 'plugins');
    const server = requireServer(req.params.serverId);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new HttpError(400, 'No files uploaded');
    const installed: string[] = [];
    for (const file of files) {
      installed.push(...installUploadedAddon(server, file.originalname, file.buffer));
    }
    appendLine(server.id, `[MultiCraft] Installed ${installed.join(', ')} — restart the server for changes to apply`);
    logAudit(req.auth!.sub, req.auth!.username, 'plugin.upload', server.id, installed.join(', '));
    res.status(201).json({ installed, plugins: listPlugins(server) });
  })
);

pluginsRouter.post(
  '/:fileName/toggle',
  asyncHandler(async (req, res) => {
    requirePermission(req, 'plugins');
    const server = requireServer(req.params.serverId);
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
    setPluginEnabled(server, req.params.fileName, enabled);
    logAudit(req.auth!.sub, req.auth!.username, 'plugin.toggle', server.id, `${req.params.fileName}=${enabled}`);
    res.json({ plugins: listPlugins(server) });
  })
);

pluginsRouter.delete(
  '/:fileName',
  asyncHandler(async (req, res) => {
    requirePermission(req, 'plugins');
    const server = requireServer(req.params.serverId);
    deletePlugin(server, req.params.fileName);
    logAudit(req.auth!.sub, req.auth!.username, 'plugin.delete', server.id, req.params.fileName);
    res.status(204).end();
  })
);
