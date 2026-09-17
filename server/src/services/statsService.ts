import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ProcessStats {
  memoryMb: number | null;
  cpuPercent: number | null;
}

// Tracks previous CPU-time samples so we can compute a delta-based percentage.
const previousCpuSample = new Map<number, { cpuSeconds: number; atMs: number }>();

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
    return { memoryMb: Number.isFinite(memoryMb) ? memoryMb : null, cpuPercent: computeCpuPercent(pid, cpuSeconds) };
  } catch {
    return { memoryMb: null, cpuPercent: null };
  }
}

async function readLinuxStats(pid: number): Promise<ProcessStats> {
  try {
    const statusText = await fs.readFile(`/proc/${pid}/status`, 'utf8');
    const rssMatch = statusText.match(/VmRSS:\s+(\d+)\s+kB/);
    const memoryMb = rssMatch ? Math.round(Number(rssMatch[1]) / 1024) : null;

    const statText = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
    const parts = statText.substring(statText.lastIndexOf(')') + 2).split(' ');
    const utime = Number(parts[11]);
    const stime = Number(parts[12]);
    const clockTicks = 100; // USER_HZ is 100 on virtually all Linux distros
    const cpuSeconds = (utime + stime) / clockTicks;
    return { memoryMb, cpuPercent: computeCpuPercent(pid, cpuSeconds) };
  } catch {
    return { memoryMb: null, cpuPercent: null };
  }
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
}

export async function readProcessStats(pid: number): Promise<ProcessStats> {
  return process.platform === 'win32' ? readWindowsStats(pid) : readLinuxStats(pid);
}
