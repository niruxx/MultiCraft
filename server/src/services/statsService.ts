import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ProcessStats {
  memoryMb: number | null;
  cpuPercent: number | null;
  /** Bytes the server's processes have read from / written to storage since they started. */
  diskReadBytes: number | null;
  diskWriteBytes: number | null;
  /** Bytes per second over the last sample interval. */
  diskReadRate: number | null;
  diskWriteRate: number | null;
  /** Host-wide (all non-loopback interfaces) traffic since this server started — the kernel
   *  doesn't account network bytes per process, so this is the machine's traffic, not just this
   *  server's. */
  netRxBytes: number | null;
  netTxBytes: number | null;
  netRxRate: number | null;
  netTxRate: number | null;
}

export function emptyStats(): ProcessStats {
  return {
    memoryMb: null,
    cpuPercent: null,
    diskReadBytes: null,
    diskWriteBytes: null,
    diskReadRate: null,
    diskWriteRate: null,
    netRxBytes: null,
    netTxBytes: null,
    netRxRate: null,
    netTxRate: null,
  };
}

// Tracks previous CPU-time samples so we can compute a delta-based percentage.
const previousCpuSample = new Map<number, { cpuSeconds: number; atMs: number }>();
// Previous I/O counters (for rates) and the network counters at first sample (for "since start").
const previousIoSample = new Map<
  number,
  { atMs: number; diskRead: number | null; diskWrite: number | null; netRx: number | null; netTx: number | null }
>();
const netBaseline = new Map<number, { rx: number; tx: number }>();

async function readWindowsStats(pid: number): Promise<ProcessStats> {
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$p = Get-Process -Id ${pid} -ErrorAction Stop; "$($p.WorkingSet64),$($p.CPU)"`,
    ]);
    const [wsRaw, cpuRaw] = stdout.trim().split(',');
    const memoryMb = Math.round(Number(wsRaw) / (1024 * 1024));
    const cpuSeconds = Number(cpuRaw);
    return {
      ...emptyStats(),
      memoryMb: Number.isFinite(memoryMb) ? memoryMb : null,
      cpuPercent: computeCpuPercent(pid, cpuSeconds),
    };
  } catch {
    return emptyStats();
  }
}

/** The root PID plus every descendant. Steam servers usually launch through a shell script, so
 *  the process we spawned is a thin wrapper and the real game is a child of it. */
async function processTree(rootPid: number): Promise<number[]> {
  const children = new Map<number, number[]>();
  let entries: string[] = [];
  try {
    entries = await fs.readdir('/proc');
  } catch {
    return [rootPid];
  }
  await Promise.all(
    entries
      .filter((name) => /^\d+$/.test(name))
      .map(async (name) => {
        try {
          const stat = await fs.readFile(`/proc/${name}/stat`, 'utf8');
          const ppid = Number(stat.substring(stat.lastIndexOf(')') + 2).split(' ')[1]);
          const list = children.get(ppid) ?? [];
          list.push(Number(name));
          children.set(ppid, list);
        } catch {
          // process exited mid-scan
        }
      })
  );
  const out: number[] = [];
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.shift()!;
    out.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return out;
}

async function readHostNetBytes(): Promise<{ rx: number; tx: number } | null> {
  try {
    const text = await fs.readFile('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n').slice(2)) {
      const [iface, data] = line.split(':');
      if (!data || iface.trim() === 'lo') continue;
      const fields = data.trim().split(/\s+/).map(Number);
      rx += fields[0] || 0;
      tx += fields[8] || 0;
    }
    return { rx, tx };
  } catch {
    return null;
  }
}

function rate(current: number | null, previous: number | null | undefined, seconds: number): number | null {
  if (current === null || previous === null || previous === undefined || seconds <= 0) return null;
  return Math.max(0, Math.round((current - previous) / seconds));
}

async function readLinuxStats(rootPid: number): Promise<ProcessStats> {
  const pids = await processTree(rootPid);
  let rssKb = 0;
  let sawMemory = false;
  let cpuTicks = 0;
  let diskRead: number | null = null;
  let diskWrite: number | null = null;

  await Promise.all(
    pids.map(async (pid) => {
      try {
        const statusText = await fs.readFile(`/proc/${pid}/status`, 'utf8');
        const rssMatch = statusText.match(/VmRSS:\s+(\d+)\s+kB/);
        if (rssMatch) {
          rssKb += Number(rssMatch[1]);
          sawMemory = true;
        }
        const statText = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
        const parts = statText.substring(statText.lastIndexOf(')') + 2).split(' ');
        cpuTicks += Number(parts[11]) + Number(parts[12]);
      } catch {
        // process exited mid-sample
      }
      try {
        // Needs the same uid (or root) — the panel launches its servers, so this is normally readable.
        const ioText = await fs.readFile(`/proc/${pid}/io`, 'utf8');
        const read = Number(ioText.match(/^read_bytes:\s+(\d+)/m)?.[1]);
        const write = Number(ioText.match(/^write_bytes:\s+(\d+)/m)?.[1]);
        if (Number.isFinite(read)) diskRead = (diskRead ?? 0) + read;
        if (Number.isFinite(write)) diskWrite = (diskWrite ?? 0) + write;
      } catch {
        // /proc/<pid>/io unreadable (different user, hardened kernel) — leave disk stats null
      }
    })
  );

  const clockTicks = 100; // USER_HZ is 100 on virtually all Linux distros
  const now = Date.now();
  const net = await readHostNetBytes();
  if (net && !netBaseline.has(rootPid)) netBaseline.set(rootPid, net);
  const baseline = netBaseline.get(rootPid);

  const prev = previousIoSample.get(rootPid);
  const elapsed = prev ? (now - prev.atMs) / 1000 : 0;
  previousIoSample.set(rootPid, { atMs: now, diskRead, diskWrite, netRx: net?.rx ?? null, netTx: net?.tx ?? null });

  return {
    memoryMb: sawMemory ? Math.round(rssKb / 1024) : null,
    cpuPercent: computeCpuPercent(rootPid, cpuTicks / clockTicks),
    diskReadBytes: diskRead,
    diskWriteBytes: diskWrite,
    diskReadRate: rate(diskRead, prev?.diskRead, elapsed),
    diskWriteRate: rate(diskWrite, prev?.diskWrite, elapsed),
    netRxBytes: net && baseline ? Math.max(0, net.rx - baseline.rx) : null,
    netTxBytes: net && baseline ? Math.max(0, net.tx - baseline.tx) : null,
    netRxRate: rate(net?.rx ?? null, prev?.netRx, elapsed),
    netTxRate: rate(net?.tx ?? null, prev?.netTx, elapsed),
  };
}

function computeCpuPercent(pid: number, cpuSeconds: number): number | null {
  const now = Date.now();
  const prev = previousCpuSample.get(pid);
  previousCpuSample.set(pid, { cpuSeconds, atMs: now });
  if (!prev) return null;
  const elapsedSeconds = (now - prev.atMs) / 1000;
  if (elapsedSeconds <= 0) return null;
  const cpuDelta = cpuSeconds - prev.cpuSeconds;
  const cores = os.cpus().length || 1;
  const pct = (cpuDelta / elapsedSeconds / cores) * 100;
  return Math.max(0, Math.round(pct * 10) / 10);
}

export function clearStatsSample(pid: number) {
  previousCpuSample.delete(pid);
  previousIoSample.delete(pid);
  netBaseline.delete(pid);
}

export async function readProcessStats(pid: number): Promise<ProcessStats> {
  return process.platform === 'win32' ? readWindowsStats(pid) : readLinuxStats(pid);
}
