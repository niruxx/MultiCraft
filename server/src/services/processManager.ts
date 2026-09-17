import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { getServer, setServerStatus } from './serverService.js';
import { instanceDir } from '../utils/paths.js';
import { findJava } from './javaService.js';
import { readProcessStats, clearStatsSample, type ProcessStats } from './statsService.js';
import { handleLogLine, resetOnlinePlayers } from './playerService.js';
import { publish, consoleTopic } from './wsHub.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/asyncHandler.js';
import type { ServerRecord } from '../types/index.js';

const LOG_BUFFER_LIMIT = 3000;
const JAVA_READY_RE = /Done \(/i;
const BEDROCK_READY_RE = /Server started\./i;
const GRACEFUL_STOP_TIMEOUT_MS = 60_000;
const STATS_INTERVAL_MS = 4000;

interface RunningInstance {
  child: ChildProcessWithoutNullStreams;
  logBuffer: string[];
  startedAt: number;
  manualStop: boolean;
  statsTimer?: NodeJS.Timeout;
  forceKillTimer?: NodeJS.Timeout;
  lastStats: ProcessStats;
}

const running = new Map<string, RunningInstance>();

function appendLog(serverId: string, line: string, stream: 'stdout' | 'stderr' | 'system') {
  const instance = running.get(serverId);
  if (instance) {
    instance.logBuffer.push(line);
    if (instance.logBuffer.length > LOG_BUFFER_LIMIT) instance.logBuffer.shift();
  }
  publish(consoleTopic(serverId), { type: 'log', stream, line, at: Date.now() });

  const event = handleLogLine(serverId, line);
  if (event) publish(consoleTopic(serverId), { type: 'player', action: event.type, name: event.name });

  if (stream !== 'system') {
    if (JAVA_READY_RE.test(line) || BEDROCK_READY_RE.test(line)) {
      const server = getServer(serverId);
      if (server && server.status === 'starting') {
        setServerStatus(serverId, 'running');
        publish(consoleTopic(serverId), { type: 'status', status: 'running' });
      }
    }
  }
}

function buildJavaCommand(server: ServerRecord, javaPath: string): { cmd: string; args: string[] } {
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
  return { cmd: javaPath, args };
}

function buildBedrockCommand(server: ServerRecord, dir: string): { cmd: string; args: string[] } {
  const executable = process.platform === 'win32' ? 'bedrock_server.exe' : './bedrock_server';
  const exePath = path.join(dir, process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server');
  if (!fs.existsSync(exePath)) {
    throw new HttpError(400, 'Bedrock server executable not found; the install may have failed');
  }
  return {
    cmd: exePath,
    args: server.extra_args ? server.extra_args.split(' ').filter(Boolean) : [],
  };
}

export async function startServer(serverId: string): Promise<void> {
  if (running.has(serverId)) throw new HttpError(409, 'Server is already running');
  const server = getServer(serverId);
  if (!server) throw new HttpError(404, 'Server not found');
  if (server.status === 'installing') throw new HttpError(409, 'Server is still installing');

  const dir = instanceDir(serverId);
  let cmd: string;
  let args: string[];
  const spawnEnv = { ...process.env };

  if (server.platform === 'java') {
    const javaPath = await findJava();
    if (!javaPath) {
      throw new HttpError(
        400,
        'No Java runtime was found on this machine. Install a Java Runtime Environment (Java 21+ recommended) and ensure `java` is on PATH or JAVA_HOME is set.'
      );
    }
    // Auto-accept EULA is handled at server-creation time (eula.txt is written there).
    ({ cmd, args } = buildJavaCommand(server, javaPath));
  } else {
    ({ cmd, args } = buildBedrockCommand(server, dir));
  }

  resetOnlinePlayers(serverId);
  setServerStatus(serverId, 'starting');
  publish(consoleTopic(serverId), { type: 'status', status: 'starting' });

  const child = spawn(cmd, args, {
    cwd: dir,
    windowsHide: true,
    env: server.platform === 'bedrock' ? { ...spawnEnv, LD_LIBRARY_PATH: dir } : spawnEnv,
  });

  const instance: RunningInstance = {
    child,
    logBuffer: [],
    startedAt: Date.now(),
    manualStop: false,
    lastStats: { memoryMb: null, cpuPercent: null },
  };
  running.set(serverId, instance);

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
  try {
    instance.child.stdin.write('stop\n');
  } catch {
    // stdin may already be closed; fall through to the force-kill timer below.
  }

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
  return running.get(serverId)?.logBuffer ?? [];
}

/** Called at server shutdown so child MC processes don't become orphaned. */
export function stopAllForShutdown(): void {
  for (const [serverId, instance] of running) {
    try {
      instance.child.stdin.write('stop\n');
    } catch {
      instance.child.kill();
    }
    logger.info(`Sent stop to server ${serverId} for panel shutdown`);
  }
}
