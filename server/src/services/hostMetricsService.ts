import fs from 'node:fs';
import os from 'node:os';
import { DATA_DIR } from '../utils/paths.js';

/**
 * Host-wide metrics for the dashboard. A background sampler keeps rates (CPU %, network and disk
 * throughput) current so a request never has to wait for two samples. Linux-only figures are null
 * elsewhere.
 */
export interface HostMetrics {
  sampledAt: string;
  cpu: { percent: number | null; cores: number; model: string; loadAvg: [number, number, number] | null; perCore: number[] };
  memory: { totalMb: number; usedMb: number; availableMb: number; swapTotalMb: number | null; swapUsedMb: number | null };
  disk: { path: string; totalBytes: number | null; usedBytes: number | null; freeBytes: number | null; readRate: number | null; writeRate: number | null };
  network: { rxRate: number | null; txRate: number | null; rxTotal: number | null; txTotal: number | null };
  uptimeSec: number;
  panelUptimeSec: number;
}

interface CpuTimes {
  idle: number;
  total: number;
}

function cpuTimes(): CpuTimes[] {
  return os.cpus().map((c) => {
    const t = c.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
  });
}

function readNet(): { rx: number; tx: number } | null {
  try {
    let rx = 0;
    let tx = 0;
    for (const line of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
      const [iface, data] = line.split(':');
      if (!data || iface.trim() === 'lo') continue;
      const f = data.trim().split(/\s+/).map(Number);
      rx += f[0] || 0;
      tx += f[8] || 0;
    }
    return { rx, tx };
  } catch {
    return null;
  }
}

/** Sectors read/written across physical block devices (partitions and virtual devices excluded). */
function readDiskIo(): { read: number; write: number } | null {
  try {
    let read = 0;
    let write = 0;
    for (const dev of fs.readdirSync('/sys/block')) {
      if (/^(loop|ram|zram|dm-|sr|fd|md)/.test(dev)) continue;
      const f = fs.readFileSync(`/sys/block/${dev}/stat`, 'utf8').trim().split(/\s+/).map(Number);
      read += (f[2] || 0) * 512;
      write += (f[6] || 0) * 512;
    }
    return { read, write };
  } catch {
    return null;
  }
}

function readMemInfo(): Record<string, number> | null {
  try {
    const out: Record<string, number> = {};
    for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
      const m = line.match(/^(\w+):\s+(\d+)/);
      if (m) out[m[1]] = Number(m[2]); // kB
    }
    return out;
  } catch {
    return null;
  }
}

let prevCpu = cpuTimes();
let prevNet = readNet();
let prevDisk = readDiskIo();
let prevAt = Date.now();
let latest = { cpuPercent: null as number | null, perCore: [] as number[], rxRate: null as number | null, txRate: null as number | null, readRate: null as number | null, writeRate: null as number | null };

function sample() {
  const now = Date.now();
  const seconds = (now - prevAt) / 1000;
  const cpu = cpuTimes();
  const perCore = cpu.map((c, i) => {
    const p = prevCpu[i];
    if (!p) return 0;
    const total = c.total - p.total;
    return total > 0 ? Math.round((1 - (c.idle - p.idle) / total) * 1000) / 10 : 0;
  });
  const totals = cpu.reduce((acc, c, i) => {
    const p = prevCpu[i];
    if (p) {
      acc.total += c.total - p.total;
      acc.idle += c.idle - p.idle;
    }
    return acc;
  }, { total: 0, idle: 0 });
  const net = readNet();
  const disk = readDiskIo();
  const rate = (cur: number | undefined, prev: number | undefined) =>
    cur === undefined || prev === undefined || seconds <= 0 ? null : Math.max(0, Math.round((cur - prev) / seconds));
  latest = {
    cpuPercent: totals.total > 0 ? Math.round((1 - totals.idle / totals.total) * 1000) / 10 : null,
    perCore,
    rxRate: rate(net?.rx, prevNet?.rx),
    txRate: rate(net?.tx, prevNet?.tx),
    readRate: rate(disk?.read, prevDisk?.read),
    writeRate: rate(disk?.write, prevDisk?.write),
  };
  prevCpu = cpu;
  prevNet = net;
  prevDisk = disk;
  prevAt = now;
}

setInterval(sample, 2000).unref();

export function getHostMetrics(): HostMetrics {
  const mem = readMemInfo();
  const totalMb = Math.round(os.totalmem() / 1048576);
  const availableMb = mem?.MemAvailable !== undefined ? Math.round(mem.MemAvailable / 1024) : Math.round(os.freemem() / 1048576);
  let diskTotal: number | null = null;
  let diskFree: number | null = null;
  try {
    const st = fs.statfsSync(DATA_DIR);
    diskTotal = st.blocks * st.bsize;
    diskFree = st.bavail * st.bsize;
  } catch {
    // statfs unsupported
  }
  const net = readNet();
  const cpus = os.cpus();
  return {
    sampledAt: new Date().toISOString(),
    cpu: {
      percent: latest.cpuPercent,
      cores: cpus.length,
      model: cpus[0]?.model.trim() ?? 'Unknown CPU',
      loadAvg: process.platform === 'win32' ? null : (os.loadavg().map((v) => Math.round(v * 100) / 100) as [number, number, number]),
      perCore: latest.perCore,
    },
    memory: {
      totalMb,
      availableMb,
      usedMb: totalMb - availableMb,
      swapTotalMb: mem?.SwapTotal !== undefined ? Math.round(mem.SwapTotal / 1024) : null,
      swapUsedMb: mem?.SwapTotal !== undefined ? Math.round((mem.SwapTotal - (mem.SwapFree ?? 0)) / 1024) : null,
    },
    disk: {
      path: DATA_DIR,
      totalBytes: diskTotal,
      freeBytes: diskFree,
      usedBytes: diskTotal !== null && diskFree !== null ? diskTotal - diskFree : null,
      readRate: latest.readRate,
      writeRate: latest.writeRate,
    },
    network: { rxRate: latest.rxRate, txRate: latest.txRate, rxTotal: net?.rx ?? null, txTotal: net?.tx ?? null },
    uptimeSec: Math.round(os.uptime()),
    panelUptimeSec: Math.round(process.uptime()),
  };
}
