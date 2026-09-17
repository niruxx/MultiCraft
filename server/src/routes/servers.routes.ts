import { Router, type Request } from 'express';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireAuth, requireRole, requireServerAccess } from '../auth/middleware.js';
import {
  createServerRecord,
  deleteServerRecord,
  getServer,
  listServers,
  setServerJar,
  setServerStatus,
  updateServerRecord,
} from '../services/serverService.js';
import { installServer, listAvailableVersions } from '../services/downloadService.js';
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
import { instanceDir } from '../utils/paths.js';
import type { Loader, Platform, Role } from '../types/index.js';

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
    if (!['vanilla', 'paper', 'purpur', 'bedrock'].includes(loader)) {
      throw new HttpError(400, 'loader must be one of vanilla, paper, purpur, bedrock');
    }
    const versions = await listAvailableVersions(loader);
    res.json({ versions });
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
    } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Server name is required');
    if (!['java', 'bedrock'].includes(platform)) throw new HttpError(400, 'Invalid platform');
    if (!['vanilla', 'paper', 'purpur', 'bedrock'].includes(loader)) throw new HttpError(400, 'Invalid loader');
    if (typeof version !== 'string' || !version) throw new HttpError(400, 'Version is required');
    if (platform === 'java' && acceptEula !== true) {
      throw new HttpError(400, "You must accept Mojang's EULA to create a Java server");
    }

    const record = createServerRecord({
      name: name.trim(),
      platform: platform as Platform,
      loader: loader as Loader,
      version,
      minMemoryMb: Number(minMemoryMb) || 1024,
      maxMemoryMb: Number(maxMemoryMb) || 2048,
      serverPort: Number(serverPort) || (platform === 'bedrock' ? 19132 : 25565),
      extraJavaArgs: typeof extraJavaArgs === 'string' ? extraJavaArgs : '',
      extraArgs: typeof extraArgs === 'string' ? extraArgs : '',
      createdBy: req.auth!.sub,
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
          (line) => appendLine(record.id, line)
        );
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
