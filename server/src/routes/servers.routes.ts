import { Router, type Request } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireRole, requireServerAccess } from '../auth/middleware.js';
import {
  createServerRecord,
  deleteServerRecord,
  getServer,
  listServers,
  setServerJar,
  setServerStatus,
  setServerVersion,
  updateServerRecord,
} from '../services/serverService.js';
import { installServer, listAvailableVersions } from '../services/downloadService.js';
import { checkForUpdate, performUpdate } from '../services/updateService.js';
import { writeEula, readServerProperties, writeServerProperties } from '../services/propertiesService.js';
import {
  getRuntimeInfo,
  getLogBuffer,
  isRunning,
  sendCommand,
  startServer,
  stopServer,
} from '../services/processManager.js';
import { getPlayerRoster } from '../services/playerService.js';
import { getUserServerAccess, logAudit } from '../services/userService.js';
import { publish, consoleTopic } from '../services/wsHub.js';
import { appendLine } from '../services/consoleLogService.js';
import { findJava, getJavaVersion } from '../services/javaService.js';
import { getDiskUsage } from '../services/diskUsageService.js';
import { instanceDir, safeJoin } from '../utils/paths.js';
import { STEAM_GAME_PRESETS, findPreset } from '../services/steamGames.js';
import { isSteamPlatform, type Loader, type Platform, type Role } from '../types/index.js';

export const serversRouter = Router();
serversRouter.use(requireAuth);

function canWrite(role: Role): boolean {
  return role === 'admin' || role === 'moderator';
}

function requireWrite(req: Request) {
  if (!canWrite(req.auth!.role)) throw new HttpError(403, 'Viewers cannot perform this action');
}

serversRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const all = listServers();
    if (req.auth!.role === 'admin') return res.json({ servers: all });
    const allowed = new Set(getUserServerAccess(req.auth!.sub));
    res.json({ servers: all.filter((s) => allowed.has(s.id)) });
  })
);

serversRouter.get(
  '/catalog/versions',
  asyncHandler(async (req, res) => {
    const loader = req.query.loader as Loader;
    if (!['vanilla', 'paper', 'purpur', 'spigot', 'bedrock', 'steam'].includes(loader)) {
      throw new HttpError(400, 'loader must be one of vanilla, paper, purpur, spigot, bedrock, steam');
    }
    const versions = await listAvailableVersions(loader);
    res.json({ versions });
  })
);

serversRouter.get(
  '/catalog/steam-games',
  asyncHandler(async (_req, res) => {
    res.json({
      games: STEAM_GAME_PRESETS.map(({ id, label, appId, defaultPort, portProtocol, notes }) => ({
        id,
        label,
        appId,
        defaultPort,
        portProtocol,
        notes: notes ?? null,
      })),
    });
  })
);

serversRouter.get(
  '/catalog/java',
  asyncHandler(async (_req, res) => {
    const javaPath = await findJava();
    const version = await getJavaVersion();
    res.json({ available: !!javaPath, path: javaPath, version });
  })
);

serversRouter.post(
  '/',
  requireRole('admin', 'moderator'),
  asyncHandler(async (req, res) => {
    const {
      name,
      platform,
      loader,
      version,
      minMemoryMb,
      maxMemoryMb,
      serverPort,
      extraJavaArgs,
      extraArgs,
      acceptEula,
      steamAppId,
      customExecutable,
    } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Server name is required');
    if (!['java', 'bedrock', 'steam'].includes(platform)) throw new HttpError(400, 'Invalid platform');
    if (!['vanilla', 'paper', 'purpur', 'spigot', 'bedrock', 'steam'].includes(loader)) {
      throw new HttpError(400, 'Invalid loader');
    }
    if (typeof version !== 'string' || !version) throw new HttpError(400, 'Version is required');
    if (platform === 'java' && acceptEula !== true) {
      throw new HttpError(400, "You must accept Mojang's EULA to create a Java server");
    }

    let preset: ReturnType<typeof findPreset> | undefined;
    if (platform === 'steam') {
      if (typeof steamAppId !== 'string' || !/^\d+$/.test(steamAppId)) {
        throw new HttpError(400, 'steamAppId is required for Steam servers and must be a numeric Steam App ID');
      }
      preset = findPreset(steamAppId);
      if (!preset && (typeof customExecutable !== 'string' || !customExecutable.trim())) {
        throw new HttpError(400, "customExecutable is required when steamAppId isn't one of the curated presets");
      }
      if (!preset) {
        // Traversal check only — the real instance directory doesn't exist yet, but safeJoin's
        // escape check is purely path math and works against any base.
        try {
          safeJoin(instanceDir('__validate__'), customExecutable.trim());
        } catch {
          throw new HttpError(400, 'customExecutable must be a relative path inside the server directory');
        }
      }
    }

    const record = createServerRecord({
      name: name.trim(),
      platform: platform as Platform,
      loader: loader as Loader,
      version,
      minMemoryMb: Number(minMemoryMb) || 1024,
      maxMemoryMb: Number(maxMemoryMb) || 2048,
      serverPort: Number(serverPort) || preset?.defaultPort || (platform === 'bedrock' ? 19132 : 25565),
      extraJavaArgs: typeof extraJavaArgs === 'string' ? extraJavaArgs : '',
      extraArgs: typeof extraArgs === 'string' ? extraArgs : '',
      createdBy: req.auth!.sub,
      steamAppId: platform === 'steam' ? steamAppId : null,
    });

    appendLine(record.id, `[MultiCraft] Creating server "${record.name}" (${loader} ${version}, ${platform})`);
    if (platform === 'java') {
      writeEula(record.id, true);
      appendLine(record.id, "[MultiCraft] Wrote eula.txt (eula=true, accepted by user at creation)");
    }

    logAudit(req.auth!.sub, req.auth!.username, 'server.create', record.id, `${loader} ${version}`);
    res.status(201).json({ server: record });

    // Install runs in the background; verbose progress is streamed over the console websocket topic,
    // the same way `npm install --verbose` streams line-by-line progress to a terminal.
    void (async () => {
      try {
        const result = await installServer(
          platform,
          loader,
          version,
          instanceDir(record.id),
          (pct, message) => publish(consoleTopic(record.id), { type: 'install_progress', pct, message }),
          (line) => appendLine(record.id, line),
          platform === 'steam' ? steamAppId : undefined
        );
        if (platform === 'steam' && !preset && typeof customExecutable === 'string') {
          // Custom (non-preset) App ID: the install step has no way to know the launch
          // executable itself, so record the user-supplied relative path now that the files exist.
          const exePath = safeJoin(instanceDir(record.id), customExecutable.trim());
          if (!fs.existsSync(exePath)) {
            throw new Error(`Custom executable not found after install: ${customExecutable.trim()}`);
          }
          if (process.platform !== 'win32') {
            try {
              fs.chmodSync(exePath, 0o755);
            } catch {
              // best-effort; startup will surface a clear error if the file truly can't be executed
            }
          }
          result.jarFile = customExecutable.trim();
        }
        if (result.jarFile) setServerJar(record.id, result.jarFile, result.build);
        else if (result.executable) setServerJar(record.id, result.executable, result.build);
        appendLine(record.id, '[MultiCraft] Installation finished — server is ready to start');
        setServerStatus(record.id, 'stopped');
        publish(consoleTopic(record.id), { type: 'status', status: 'stopped' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendLine(record.id, `[MultiCraft] Installation failed: ${message}`, 'stderr');
        setServerStatus(record.id, 'install_failed');
        publish(consoleTopic(record.id), { type: 'status', status: 'install_failed', error: message });
      }
    })();
  })
);

serversRouter.get(
  '/:serverId',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    res.json({ server, runtime: getRuntimeInfo(server.id), running: isRunning(server.id) });
  })
);

serversRouter.patch(
  '/:serverId',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    const { name, minMemoryMb, maxMemoryMb, serverPort, extraJavaArgs, extraArgs, autoStart } = req.body ?? {};
    updateServerRecord(server.id, {
      name,
      minMemoryMb: minMemoryMb !== undefined ? Number(minMemoryMb) : undefined,
      maxMemoryMb: maxMemoryMb !== undefined ? Number(maxMemoryMb) : undefined,
      serverPort: serverPort !== undefined ? Number(serverPort) : undefined,
      extraJavaArgs,
      extraArgs,
      autoStart,
    });
    logAudit(req.auth!.sub, req.auth!.username, 'server.update', server.id);
    res.json({ server: getServer(server.id) });
  })
);

serversRouter.delete(
  '/:serverId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    if (isRunning(server.id)) throw new HttpError(409, 'Stop the server before deleting it');
    deleteServerRecord(server.id);
    logAudit(req.auth!.sub, req.auth!.username, 'server.delete', server.id);
    res.status(204).end();
  })
);

serversRouter.post(
  '/:serverId/start',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    await startServer(req.params.serverId);
    logAudit(req.auth!.sub, req.auth!.username, 'server.start', req.params.serverId);
    res.status(202).json({ ok: true });
  })
);

serversRouter.post(
  '/:serverId/stop',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    stopServer(req.params.serverId, { force: req.body?.force === true });
    logAudit(req.auth!.sub, req.auth!.username, 'server.stop', req.params.serverId);
    res.status(202).json({ ok: true });
  })
);

serversRouter.post(
  '/:serverId/restart',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const serverId = req.params.serverId;
    if (isRunning(serverId)) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!isRunning(serverId)) {
            clearInterval(check);
            resolve();
          }
        }, 500);
        stopServer(serverId);
      });
    }
    await startServer(serverId);
    logAudit(req.auth!.sub, req.auth!.username, 'server.restart', serverId);
    res.status(202).json({ ok: true });
  })
);

serversRouter.post(
  '/:serverId/command',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const { command } = req.body ?? {};
    if (typeof command !== 'string' || !command.trim()) throw new HttpError(400, 'Command is required');
    sendCommand(req.params.serverId, command);
    res.status(202).json({ ok: true });
  })
);

serversRouter.get(
  '/:serverId/console/history',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    res.json({ lines: getLogBuffer(req.params.serverId) });
  })
);

serversRouter.get(
  '/:serverId/players',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    if (isSteamPlatform(server.platform)) throw new HttpError(400, 'Steam-platform servers have no player roster');
    res.json({ players: getPlayerRoster(req.params.serverId) });
  })
);

const PLAYER_ACTIONS: Record<string, (name: string, arg?: string) => string> = {
  op: (name) => `op ${name}`,
  deop: (name) => `deop ${name}`,
  'whitelist-add': (name) => `whitelist add ${name}`,
  'whitelist-remove': (name) => `whitelist remove ${name}`,
  ban: (name, reason) => `ban ${name}${reason ? ' ' + reason : ''}`,
  pardon: (name) => `pardon ${name}`,
  kick: (name, reason) => `kick ${name}${reason ? ' ' + reason : ''}`,
};

serversRouter.post(
  '/:serverId/players/:name/:action',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const { serverId, name, action } = req.params;
    const server = getServer(serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    if (isSteamPlatform(server.platform)) throw new HttpError(400, 'Steam-platform servers have no operator/player commands');
    const builder = PLAYER_ACTIONS[action];
    if (!builder) throw new HttpError(400, `Unknown player action: ${action}`);
    if (!isRunning(serverId)) {
      throw new HttpError(409, 'Start the server to manage players (actions are applied via the live console)');
    }
    sendCommand(serverId, builder(name, req.body?.reason));
    logAudit(req.auth!.sub, req.auth!.username, `player.${action}`, serverId, name);
    res.status(202).json({ ok: true });
  })
);

serversRouter.get(
  '/:serverId/properties',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    res.json({ properties: readServerProperties(server.id, server.platform) });
  })
);

serversRouter.put(
  '/:serverId/properties',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    const { updates } = req.body ?? {};
    if (!updates || typeof updates !== 'object') throw new HttpError(400, 'updates object is required');
    writeServerProperties(server.id, server.platform, updates);
    logAudit(req.auth!.sub, req.auth!.username, 'server.properties.update', server.id);
    res.json({ properties: readServerProperties(server.id, server.platform) });
  })
);

serversRouter.get(
  '/:serverId/resources',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    const disk = getDiskUsage(server.id);
    res.json({
      runtime: getRuntimeInfo(server.id),
      running: isRunning(server.id),
      disk,
      host: {
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
        cpuCores: os.cpus().length,
        loadAvg: process.platform === 'win32' ? null : os.loadavg()[0],
      },
    });
  })
);

serversRouter.get(
  '/:serverId/update/check',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    try {
      const result = await checkForUpdate(server);
      res.json(result);
    } catch (err) {
      throw new HttpError(502, err instanceof Error ? err.message : 'Failed to check for updates');
    }
  })
);

serversRouter.post(
  '/:serverId/update',
  requireServerAccess(),
  asyncHandler(async (req, res) => {
    requireWrite(req);
    const server = getServer(req.params.serverId);
    if (!server) throw new HttpError(404, 'Server not found');
    if (isRunning(server.id)) throw new HttpError(409, 'Stop the server before updating it');
    if (server.status === 'installing' || server.status === 'updating') {
      throw new HttpError(409, 'An install or update is already in progress');
    }

    const targetVersion = typeof req.body?.targetVersion === 'string' ? req.body.targetVersion : undefined;
    setServerStatus(server.id, 'updating');
    publish(consoleTopic(server.id), { type: 'status', status: 'updating' });
    appendLine(server.id, `[MultiCraft] Update requested by ${req.auth!.username}`);
    logAudit(req.auth!.sub, req.auth!.username, 'server.update', server.id, targetVersion ?? server.version);
    res.status(202).json({ ok: true });

    void (async () => {
      try {
        const result = await performUpdate(
          server,
          targetVersion,
          (pct, message) => publish(consoleTopic(server.id), { type: 'install_progress', pct, message }),
          (line) => appendLine(server.id, line)
        );
        setServerVersion(server.id, result.version, result.jarFile, result.build);
        appendLine(server.id, '[MultiCraft] Update finished — server is ready to start');
        setServerStatus(server.id, 'stopped');
        publish(consoleTopic(server.id), { type: 'status', status: 'stopped' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendLine(server.id, `[MultiCraft] Update failed: ${message}`, 'stderr');
        setServerStatus(server.id, 'stopped');
        publish(consoleTopic(server.id), { type: 'status', status: 'stopped', error: message });
      }
    })();
  })
);
