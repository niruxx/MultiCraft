import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { HttpError } from '../utils/asyncHandler.js';
import { instanceDir } from '../utils/paths.js';
import { expandVariables, launchVariables, splitArgs } from './launchConfig.js';
import type { ServerRecord } from '../types/index.js';

/**
 * Docker-backed instances. Works with Docker or Podman (same CLI); Podman's rootless mode needs no
 * root daemon at all. The container only ever sees the instance folder, mounted at `dataPath`.
 */

export interface PortMapping {
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
}

export interface DockerConfig {
  image: string;
  ports: PortMapping[];
  env: { key: string; value: string }[];
  /** Where the instance folder is mounted inside the container. */
  dataPath: string;
  /** CPU limit (e.g. 2 = two cores); null = unlimited. */
  cpus: number | null;
  /** Overrides the image's command (optional). */
  command: string;
  /** Run as the panel's user so files in the instance folder stay editable from the panel. */
  runAsPanelUser: boolean;
}

export interface EngineStatus {
  available: boolean;
  engine: 'docker' | 'podman' | null;
  version: string | null;
  rootless: boolean;
  error: string | null;
  hint: string | null;
}

// ---------------------------------------------------------------------------
// Engine detection
// ---------------------------------------------------------------------------

let cached: { status: EngineStatus; at: number } | null = null;

function tryEngine(bin: 'docker' | 'podman'): EngineStatus | null {
  const res = spawnSync(bin, ['version', '--format', bin === 'docker' ? '{{.Server.Version}}' : '{{.Version}}'], { encoding: 'utf8', timeout: 8000 });
  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') return null;
  if (res.status === 0 && res.stdout.trim()) {
    let rootless = bin === 'podman';
    if (bin === 'docker') {
      const info = spawnSync('docker', ['info', '--format', '{{.SecurityOptions}}'], { encoding: 'utf8', timeout: 8000 });
      rootless = /rootless/.test(info.stdout ?? '');
    } else {
      const info = spawnSync('podman', ['info', '--format', '{{.Host.Security.Rootless}}'], { encoding: 'utf8', timeout: 8000 });
      rootless = (info.stdout ?? '').trim() !== 'false';
    }
    return { available: true, engine: bin, version: res.stdout.trim().split('\n')[0], rootless, error: null, hint: null };
  }
  const err = `${res.stderr ?? ''}${res.stdout ?? ''}`.trim();
  const permission = /permission denied/i.test(err);
  return {
    available: false,
    engine: bin,
    version: null,
    rootless: false,
    error: err.split('\n')[0] || `${bin} isn't responding`,
    hint: permission
      ? `The panel's user can't talk to the ${bin} daemon. Add it to the docker group (\`sudo usermod -aG docker <user>\`, then log out/in and restart the panel) — or use rootless Docker/Podman.`
      : bin === 'docker'
        ? 'Start the Docker service: `sudo systemctl enable --now docker`.'
        : null,
  };
}

export function getEngineStatus(force = false): EngineStatus {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.status;
  const pinned = process.env.MULTICRAFT_CONTAINER_ENGINE as 'docker' | 'podman' | undefined;
  const candidates: ('docker' | 'podman')[] = pinned === 'podman' || pinned === 'docker' ? [pinned] : ['docker', 'podman'];
  let status: EngineStatus | null = null;
  for (const bin of candidates) {
    const s = tryEngine(bin);
    if (s?.available) {
      status = s;
      break;
    }
    status ??= s;
  }
  status ??= {
    available: false,
    engine: null,
    version: null,
    rootless: false,
    error: 'Neither Docker nor Podman is installed.',
    hint: 'Install Podman (rootless, no daemon — e.g. `sudo apt install podman`, `sudo dnf install podman`, `sudo pacman -S podman`) or Docker Engine, then click Refresh.',
  };
  cached = { status, at: Date.now() };
  return status;
}

function requireEngine(): 'docker' | 'podman' {
  const s = getEngineStatus();
  if (!s.available || !s.engine) throw new HttpError(400, `${s.error ?? 'No container engine'}${s.hint ? ` — ${s.hint}` : ''}`);
  return s.engine;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IMAGE_RE = /^[a-z0-9]+([._/:@-][a-zA-Z0-9_.-]+)*$/;
const portOk = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 65535;

export function dockerConfigOf(server: Pick<ServerRecord, 'docker_config'>): DockerConfig | null {
  if (!server.docker_config) return null;
  try {
    return JSON.parse(server.docker_config) as DockerConfig;
  } catch {
    return null;
  }
}

export function sanitizeDockerConfig(input: unknown): DockerConfig {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'docker config must be an object');
  const raw = input as Record<string, any>;
  const image = typeof raw.image === 'string' ? raw.image.trim() : '';
  if (!image || image.length > 255 || !IMAGE_RE.test(image)) throw new HttpError(400, 'Enter a valid image name, e.g. itzg/minecraft-server:latest');
  const ports: PortMapping[] = (Array.isArray(raw.ports) ? raw.ports : []).slice(0, 32).map((p: any, i: number) => {
    const host = Number(p?.host);
    const container = Number(p?.container ?? p?.host);
    if (!portOk(host) || !portOk(container)) throw new HttpError(400, `Port mapping ${i + 1}: ports must be 1–65535`);
    return { host, container, protocol: p?.protocol === 'udp' ? 'udp' : 'tcp' };
  });
  if (!ports.length) throw new HttpError(400, 'Add at least one port mapping');
  const env = (Array.isArray(raw.env) ? raw.env : [])
    .filter((e: any) => e && typeof e.key === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key.trim()))
    .slice(0, 100)
    .map((e: any) => ({ key: e.key.trim(), value: String(e.value ?? '').slice(0, 4000) }));
  const dataPath = typeof raw.dataPath === 'string' && raw.dataPath.trim().startsWith('/') ? raw.dataPath.trim() : '/data';
  if (dataPath === '/' || /[:,\s]/.test(dataPath)) throw new HttpError(400, 'Data path must be an absolute folder inside the container, e.g. /data');
  const cpus = raw.cpus === null || raw.cpus === '' || raw.cpus === undefined ? null : Number(raw.cpus);
  if (cpus !== null && (!Number.isFinite(cpus) || cpus <= 0 || cpus > 256)) throw new HttpError(400, 'CPU limit must be a positive number of cores');
  return {
    image,
    ports,
    env,
    dataPath,
    cpus,
    command: typeof raw.command === 'string' ? raw.command.trim().slice(0, 2000) : '',
    runAsPanelUser: raw.runAsPanelUser !== false,
  };
}

export function containerName(server: Pick<ServerRecord, 'id'>): string {
  return `multicraft-${server.id.slice(0, 12)}`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const selinuxEnforcing = () => {
  try {
    return fs.readFileSync('/sys/fs/selinux/enforce', 'utf8').trim() === '1';
  } catch {
    return false;
  }
};

/** `docker run …` for an instance. Attached with -i so console input/output works like any other instance. */
export function buildContainerLaunch(server: ServerRecord): { cmd: string; args: string[] } {
  const engine = requireEngine();
  const config = dockerConfigOf(server);
  if (!config) throw new HttpError(400, 'This Docker instance has no container settings');
  const vars = launchVariables(server);
  const dir = instanceDir(server.id);
  fs.mkdirSync(dir, { recursive: true });
  const name = containerName(server);
  // A container left behind by a panel restart would block the name.
  spawnSync(engine, ['rm', '-f', name], { stdio: 'ignore', timeout: 20000 });

  const args = [
    'run',
    '--rm',
    '-i',
    '--init',
    '--sig-proxy=true',
    '--name', name,
    '--label', `multicraft.instance=${server.id}`,
    '--hostname', 'multicraft',
    '-v', `${dir}:${config.dataPath}${selinuxEnforcing() ? ':Z' : ''}`,
    '--memory', `${server.max_memory_mb}m`,
    '--pids-limit', '4096',
    '--security-opt', 'no-new-privileges',
  ];
  for (const p of config.ports) args.push('-p', `${p.host}:${p.container}/${p.protocol}`);
  for (const e of config.env) args.push('-e', `${e.key}=${expandVariables(e.value, vars)}`);
  if (config.cpus) args.push('--cpus', String(config.cpus));
  if (config.runAsPanelUser && process.platform !== 'win32') {
    // Rootless Podman already maps the container's root to the panel user; keep-id makes the
    // container user *be* the panel user. Docker needs an explicit --user.
    if (engine === 'podman') args.push('--userns=keep-id');
    else args.push('--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`);
  }
  args.push(config.image, ...(config.command ? splitArgs(expandVariables(config.command, vars)) : []));
  return { cmd: engine, args };
}

/** Pulls the image, streaming progress lines to `onLog`. */
export function pullImage(image: string, onLog: (line: string) => void): Promise<void> {
  const engine = requireEngine();
  return new Promise((resolve, reject) => {
    onLog(`==> ${engine} pull ${image}`);
    const p = spawn(engine, ['pull', image], { windowsHide: true });
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) onLog(line.trim());
    };
    p.stdout.on('data', forward);
    p.stderr.on('data', forward);
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${engine} pull exited with code ${code}`))));
  });
}

/** Force-stops an instance's container (SIGKILL can't be proxied through the attached CLI). */
export function killContainer(server: Pick<ServerRecord, 'id'>) {
  const engine = getEngineStatus().engine;
  if (!engine) return;
  spawn(engine, ['kill', containerName(server)], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };

export function parseSize(text: string): number | null {
  const m = text.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
  if (!m) return null;
  return Math.round(Number(m[1]) * (UNITS[(m[2] ?? 'b').toLowerCase()] ?? 1));
}

export interface ContainerSample {
  cpuPercent: number | null;
  memoryMb: number | null;
  netRx: number | null;
  netTx: number | null;
  blockRead: number | null;
  blockWrite: number | null;
}

/** One `stats --no-stream` sample. Unlike host processes, containers report their own network I/O. */
export function sampleContainer(server: Pick<ServerRecord, 'id'>): Promise<ContainerSample | null> {
  const engine = getEngineStatus().engine;
  if (!engine) return Promise.resolve(null);
  return new Promise((resolve) => {
    const p = spawn(engine, ['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}', containerName(server)], {
      windowsHide: true,
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => resolve(null));
    p.on('exit', (code) => {
      if (code !== 0) return resolve(null);
      const [cpu, mem, net, block] = out.trim().split('\n').pop()!.split('|');
      const pair = (s: string | undefined) => (s ?? '').split('/').map((x) => parseSize(x));
      const [memUsed] = pair(mem);
      const [rx, tx] = pair(net);
      const [read, write] = pair(block);
      resolve({
        cpuPercent: cpu ? Math.round(parseFloat(cpu) * 10) / 10 : null,
        memoryMb: memUsed !== null && memUsed !== undefined ? Math.round(memUsed / 1048576) : null,
        netRx: rx ?? null,
        netTx: tx ?? null,
        blockRead: read ?? null,
        blockWrite: write ?? null,
      });
    });
    setTimeout(() => p.kill(), 15000).unref();
  });
}

/** Containers MultiCraft launched (by label), including any orphaned by a panel restart. */
export function listManagedContainers(): { name: string; status: string; image: string; instanceId: string }[] {
  const engine = getEngineStatus().engine;
  if (!engine) return [];
  const res = spawnSync(engine, ['ps', '-a', '--filter', 'label=multicraft.instance', '--format', '{{.Names}}|{{.Status}}|{{.Image}}|{{.Labels}}'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  if (res.status !== 0) return [];
  return res.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, status, image, labels] = line.split('|');
      return { name, status, image, instanceId: labels?.match(/multicraft\.instance[=:]([0-9a-f-]{36})/)?.[1] ?? '' };
    });
}

export function engineCounts(): { containers: number; running: number; images: number } | null {
  const engine = getEngineStatus().engine;
  if (!engine) return null;
  const count = (args: string[]) => {
    const r = spawnSync(engine, args, { encoding: 'utf8', timeout: 10000 });
    return r.status === 0 ? r.stdout.trim().split('\n').filter(Boolean).length : 0;
  };
  return { containers: count(['ps', '-aq']), running: count(['ps', '-q']), images: count(['images', '-q']) };
}
