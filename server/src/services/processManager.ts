import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { getServer, setServerStatus } from './serverService.js';
import { instanceDir } from '../utils/paths.js';
import { findJava } from './javaService.js';
import { readProcessStats, clearStatsSample, type ProcessStats } from './statsService.js';
import { handleLogLine, resetOnlinePlayers } from './playerService.js';
import { publish, consoleTopic } from './wsHub.js';
import * as consoleLog from './consoleLogService.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/asyncHandler.js';
import { findPreset, type StopStrategy } from './steamGames.js';
import type { ServerRecord } from '../types/index.js';

const JAVA_READY_RE = /Done \(/i;
const BEDROCK_READY_RE = /Server started\./i;
const GRACEFUL_STOP_TIMEOUT_MS = 60_000;
const STATS_INTERVAL_MS = 4000;

const JAVA_STOP: StopStrategy = { kind: 'stdin', commands: ['stop'], delayMs: 0 };
// Preserves Bedrock's existing exact behavior (stdin "stop") — not a signal change.
const BEDROCK_STOP: StopStrategy = { kind: 'stdin', commands: ['stop'], delayMs: 0 };
const CUSTOM_STEAM_STOP: StopStrategy = { kind: 'signal', signal: 'SIGTERM' };

interface RunningInstance {
  child: ChildProcessWithoutNullStreams;
  startedAt: number;
  manualStop: boolean;
  statsTimer?: NodeJS.Timeout;
  forceKillTimer?: NodeJS.Timeout;
  lastStats: ProcessStats;
  readyRegex: RegExp | null;
  stopStrategy: StopStrategy;
}

const running = new Map<string, RunningInstance>();

function appendLog(serverId: string, line: string, stream: 'stdout' | 'stderr' | 'system') {
  consoleLog.appendLine(serverId, line, stream);

  const event = handleLogLine(serverId, line);
  if (event) publish(consoleTopic(serverId), { type: 'player', action: event.type, name: event.name });

  if (stream !== 'system') {
    const instance = running.get(serverId);
    if (instance?.readyRegex?.test(line)) {
      const server = getServer(serverId);
      if (server && server.status === 'starting') {
        setServerStatus(serverId, 'running');
        publish(consoleTopic(serverId), { type: 'status', status: 'running' });
      }
    }
  }
}

function buildJavaCommand(server: ServerRecord, javaPath: string): { cmd: string; args: string[]; useShell: boolean } {
  if (!server.jar_file) throw new HttpError(400, 'Server has not finished installing yet');
  const args = [
    `-Xms${server.min_memory_mb}M`,
    `-Xmx${server.max_memory_mb}M`,
    ...(server.extra_java_args ? server.extra_java_args.split(' ').filter(Boolean) : []),
    '-jar',
    server.jar_file,
    'nogui',
    ...(server.extra_args ? server.extra_args.split(' ').filter(Boolean) : []),
  ];
  return { cmd: javaPath, args, useShell: false };
}

function buildBedrockCommand(server: ServerRecord, dir: string): { cmd: string; args: string[]; useShell: boolean } {
  const exeName = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
  const exePath = path.join(dir, exeName);
  if (!fs.existsSync(exePath)) {
    throw new HttpError(400, 'Bedrock server executable not found; the install may have failed');
  }
  return {
    cmd: exePath,
    args: server.extra_args ? server.extra_args.split(' ').filter(Boolean) : [],
    useShell: false,
  };
}

function buildSteamCommand(server: ServerRecord, dir: string): { cmd: string; args: string[]; useShell: boolean } {
  const preset = findPreset(server.steam_app_id);
  const exeName = preset
    ? (process.platform === 'win32' ? preset.executable.win32 : preset.executable.linux)
    : server.jar_file; // custom App ID: the install-time-resolved relative executable path
  if (!exeName) throw new HttpError(400, 'No launch executable is configured for this server');
  const exePath = path.join(dir, exeName);
  if (!fs.existsSync(exePath)) {
    throw new HttpError(400, `Server executable not found at ${exeName} — the install may have failed`);
  }
  const args = preset ? preset.buildLaunchArgs(server) : (server.extra_args ? server.extra_args.split(' ').filter(Boolean) : []);
  return { cmd: exePath, args, useShell: process.platform === 'win32' && exeName.toLowerCase().endsWith('.bat') };
}

function resolveReadyRegex(server: ServerRecord): RegExp | null {
  if (server.platform === 'java') return JAVA_READY_RE;
  if (server.platform === 'bedrock') return BEDROCK_READY_RE;
  return findPreset(server.steam_app_id)?.readyRegex ?? null;
}

function resolveStopStrategy(server: ServerRecord): StopStrategy {
  if (server.platform === 'java') return JAVA_STOP;
  if (server.platform === 'bedrock') return BEDROCK_STOP;
  return findPreset(server.steam_app_id)?.stopStrategy ?? CUSTOM_STEAM_STOP;
}

/** Issues a graceful-stop request per the resolved strategy. The caller is always responsible
 *  for arming a force-kill fallback timer — this never guarantees the process actually exits. */
function issueStop(instance: RunningInstance) {
  const strategy = instance.stopStrategy;
  if (strategy.kind === 'stdin') {
    void (async () => {
      for (const command of strategy.commands) {
        try {
          instance.child.stdin.write(command + '\n');
        } catch {
          return; // stdin already closed — nothing more to do, force-kill timer will handle it
        }
        if (strategy.delayMs) await new Promise((resolve) => setTimeout(resolve, strategy.delayMs));
      }
    })();
  } else if (strategy.kind === 'signal') {
    instance.child.kill(strategy.signal);
  } else {
    instance.child.kill('SIGTERM');
  }
}

export async function startServer(serverId: string): Promise<void> {
  if (running.has(serverId)) throw new HttpError(409, 'Server is already running');
  const server = getServer(serverId);
  if (!server) throw new HttpError(404, 'Server not found');
  if (server.status === 'installing') throw new HttpError(409, 'Server is still installing');

  const dir = instanceDir(serverId);
  let cmd: string;
  let args: string[];
  let useShell = false;
  const spawnEnv = { ...process.env };

  appendLog(
    serverId,
    `[MultiCraft] Host environment: ${process.platform} (${process.arch})`,
    'system'
  );

  if (server.platform === 'java') {
    const javaPath = await findJava();
    if (!javaPath) {
      throw new HttpError(
        400,
        'No Java runtime was found on this machine. Install a Java Runtime Environment (Java 21+ recommended) and ensure `java` is on PATH or JAVA_HOME is set.'
      );
    }
    // Auto-accept EULA is handled at server-creation time (eula.txt is written there).
    ({ cmd, args, useShell } = buildJavaCommand(server, javaPath));
    appendLog(serverId, `[MultiCraft] Launching with ${javaPath} ${args.join(' ')}`, 'system');
  } else if (server.platform === 'bedrock') {
    ({ cmd, args, useShell } = buildBedrockCommand(server, dir));
    appendLog(
      serverId,
      `[MultiCraft] Launching ${process.platform === 'win32' ? 'Windows' : 'Linux'} Bedrock binary: ${cmd}`,
      'system'
    );
  } else {
    ({ cmd, args, useShell } = buildSteamCommand(server, dir));
    appendLog(serverId, `[MultiCraft] Launching Steam server: ${cmd} ${args.join(' ')}`, 'system');
  }

  resetOnlinePlayers(serverId);
  setServerStatus(serverId, 'starting');
  publish(consoleTopic(serverId), { type: 'status', status: 'starting' });

  const child = spawn(cmd, args, {
    cwd: dir,
    windowsHide: true,
    shell: useShell,
    env: server.platform === 'bedrock' || (server.platform === 'steam' && process.platform !== 'win32')
      ? { ...spawnEnv, LD_LIBRARY_PATH: dir }
      : spawnEnv,
  });

  const readyRegex = resolveReadyRegex(server);
  const instance: RunningInstance = {
    child,
    startedAt: Date.now(),
    manualStop: false,
    lastStats: { memoryMb: null, cpuPercent: null },
    readyRegex,
    stopStrategy: resolveStopStrategy(server),
  };
  running.set(serverId, instance);

  if (readyRegex === null) {
    // No known "ready" log line for this game — mark it running as soon as we know the process
    // didn't immediately fail to spawn, rather than leaving it stuck in "starting" forever.
    setImmediate(() => {
      if (!running.has(serverId)) return; // already exited
      const current = getServer(serverId);
      if (current && current.status === 'starting') {
        setServerStatus(serverId, 'running');
        publish(consoleTopic(serverId), { type: 'status', status: 'running' });
      }
    });
  }

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) if (line.length) appendLog(serverId, line, 'stdout');
  });
  child.stderr.on('data', (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) if (line.length) appendLog(serverId, line, 'stderr');
  });

  child.on('error', (err) => {
    appendLog(serverId, `[MultiCraft] Failed to start process: ${err.message}`, 'system');
  });

  child.on('exit', (code, signal) => {
    logger.info(`Server ${serverId} exited`, { code, signal });
    const inst = running.get(serverId);
    if (inst?.statsTimer) clearInterval(inst.statsTimer);
    if (inst?.forceKillTimer) clearTimeout(inst.forceKillTimer);
    if (child.pid) clearStatsSample(child.pid);
    const wasManual = inst?.manualStop ?? false;
    running.delete(serverId);
    resetOnlinePlayers(serverId);
    const finalStatus = wasManual || code === 0 ? 'stopped' : 'crashed';
    setServerStatus(serverId, finalStatus);
    appendLog(serverId, `[MultiCraft] Process exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`, 'system');
    publish(consoleTopic(serverId), { type: 'status', status: finalStatus });
  });

  instance.statsTimer = setInterval(async () => {
    if (!child.pid) return;
    const stats = await readProcessStats(child.pid);
    instance.lastStats = stats;
    publish(consoleTopic(serverId), { type: 'stats', ...stats });
  }, STATS_INTERVAL_MS);
}

export function stopServer(serverId: string, options: { force?: boolean } = {}): void {
  const instance = running.get(serverId);
  if (!instance) throw new HttpError(409, 'Server is not running');
  instance.manualStop = true;

  if (options.force) {
    instance.child.kill('SIGKILL');
    return;
  }

  setServerStatus(serverId, 'stopping');
  publish(consoleTopic(serverId), { type: 'status', status: 'stopping' });
  issueStop(instance);

  instance.forceKillTimer = setTimeout(() => {
    if (running.has(serverId)) {
      appendLog(serverId, '[MultiCraft] Graceful stop timed out, forcing termination', 'system');
      instance.child.kill('SIGKILL');
    }
  }, GRACEFUL_STOP_TIMEOUT_MS);
}

export function sendCommand(serverId: string, command: string): void {
  const instance = running.get(serverId);
  if (!instance) throw new HttpError(409, 'Server is not running');
  appendLog(serverId, `> ${command}`, 'system');
  instance.child.stdin.write(command.trim() + '\n');
}

export function isRunning(serverId: string): boolean {
  return running.has(serverId);
}

export function getRuntimeInfo(serverId: string) {
  const instance = running.get(serverId);
  if (!instance) return null;
  return {
    pid: instance.child.pid ?? null,
    uptimeMs: Date.now() - instance.startedAt,
    stats: instance.lastStats,
  };
}

export function getLogBuffer(serverId: string): string[] {
  return consoleLog.getBuffer(serverId);
}

/** Called at server shutdown so child MC processes don't become orphaned. */
export function stopAllForShutdown(): void {
  for (const [serverId, instance] of running) {
    try {
      issueStop(instance);
    } catch {
      instance.child.kill();
    }
    logger.info(`Sent stop to server ${serverId} for panel shutdown`);
  }
}
