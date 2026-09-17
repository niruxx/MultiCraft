import { useEffect, useRef, useState } from 'react';
import { useServerDetail } from './ServerContext.js';
import { useConsoleSocket } from '../../hooks/useConsoleSocket.js';
import { api, ApiError } from '../../api/client.js';
import type { ResourcesInfo } from '../../api/types.js';
import { Card, Skeleton } from '../../components/ui.js';

interface ChartPoint {
  t: number;
  value: number;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** A single-series magnitude-over-time sparkline: thin 2px line, rounded end, hover crosshair + tooltip. */
function Sparkline({
  data,
  color,
  formatValue,
  emptyLabel,
}: {
  data: ChartPoint[];
  color: string;
  formatValue: (v: number) => string;
  emptyLabel: string;
}) {
  const width = 100; // viewBox units; scales responsively via SVG width=100%
  const height = 48;
  const pad = 3;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const values = data.map((d) => d.value);
  if (values.length < 2) {
    return <div className="flex h-12 items-center text-xs text-ink-600">{emptyLabel}</div>;
  }

  const max = Math.max(1, ...values);
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - (v / max) * (height - pad * 2);
    return [x, y] as const;
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(2)},${height - pad} L${pad},${height - pad} Z`;
  const last = points[points.length - 1];
  const hover = hoverIdx !== null ? points[hoverIdx] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let bestDist = Infinity;
    points.forEach(([x], i) => {
      const d = Math.abs(x - relX);
      if (d < bestDist) {
        bestDist = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-12 w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={last[0]} cy={last[1]} r="1.8" fill={color} />
        {hover && (
          <line x1={hover[0]} x2={hover[0]} y1={pad} y2={height - pad} stroke="currentColor" strokeWidth="1" className="text-surface-600" vectorEffect="non-scaling-stroke" />
        )}
        {hover && <circle cx={hover[0]} cy={hover[1]} r="2.2" fill={color} stroke="black" strokeOpacity="0.4" />}
      </svg>
      {hoverIdx !== null && (
        <div className="pointer-events-none absolute -top-7 rounded-md bg-surface-950 px-2 py-1 text-[11px] font-medium text-ink-200 shadow-card" style={{ left: `${(hover![0] / width) * 100}%`, transform: 'translateX(-50%)' }}>
          {formatValue(values[hoverIdx])}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, chart }: { label: string; value: string; sub?: string; chart?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink-50">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
      {chart && <div className="mt-3">{chart}</div>}
    </Card>
  );
}

export function ResourcesTab() {
  const { serverId, running } = useServerDetail();
  const { stats, statsHistory, connected } = useConsoleSocket(serverId);
  const [info, setInfo] = useState<ResourcesInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<ResourcesInfo>(`/servers/${serverId}/resources`);
        if (!cancelled) setInfo(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load resource info');
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverId]);

  const cpuData = statsHistory.filter((s) => s.cpuPercent !== null).map((s) => ({ t: s.t, value: s.cpuPercent as number }));
  const memData = statsHistory.filter((s) => s.memoryMb !== null).map((s) => ({ t: s.t, value: s.memoryMb as number }));

  const usedMb = info?.host ? info.host.totalMemMb - info.host.freeMemMb : null;
  const memSharePct = info?.host && stats.memoryMb ? Math.min(100, Math.round((stats.memoryMb / info.host.totalMemMb) * 100)) : null;

  if (error) return <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>;

  return (
    <div className="space-y-6">
      {!running && (
        <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400">
          The server is stopped — live CPU/RAM charts will populate once it's running. Disk usage below is still current.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="CPU usage"
          value={stats.cpuPercent !== null ? `${stats.cpuPercent}%` : '—'}
          sub={info?.host ? `${info.host.cpuCores} logical cores on host` : undefined}
          chart={<Sparkline data={cpuData} color="#34e0a1" formatValue={(v) => `${v.toFixed(1)}%`} emptyLabel="Collecting samples…" />}
        />
        <StatCard
          label="Memory usage"
          value={stats.memoryMb !== null ? formatBytes(stats.memoryMb * 1024 * 1024) : '—'}
          sub={memSharePct !== null ? `${memSharePct}% of host RAM` : undefined}
          chart={<Sparkline data={memData} color="#22d3ee" formatValue={(v) => formatBytes(v * 1024 * 1024)} emptyLabel="Collecting samples…" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {info ? (
          <>
            <StatCard label="Uptime" value={info.runtime ? formatUptime(info.runtime.uptimeMs) : '—'} />
            <StatCard label="Process ID" value={info.runtime?.pid ? String(info.runtime.pid) : '—'} />
            <StatCard label="World + files" value={formatBytes(info.disk.serverBytes)} />
            <StatCard label="Backups" value={formatBytes(info.disk.backupsBytes)} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-6 w-20" />
            </Card>
          ))
        )}
      </div>

      {info?.host && (
        <Card className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Host machine</p>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-ink-500">Total RAM</p>
              <p className="font-medium text-ink-200">{formatBytes(info.host.totalMemMb * 1024 * 1024)}</p>
            </div>
            <div>
              <p className="text-ink-500">Free RAM</p>
              <p className="font-medium text-ink-200">{formatBytes(info.host.freeMemMb * 1024 * 1024)}</p>
            </div>
            <div>
              <p className="text-ink-500">Used (all processes)</p>
              <p className="font-medium text-ink-200">{usedMb !== null ? formatBytes(usedMb * 1024 * 1024) : '—'}</p>
            </div>
            <div>
              <p className="text-ink-500">CPU cores</p>
              <p className="font-medium text-ink-200">{info.host.cpuCores}</p>
            </div>
          </div>
        </Card>
      )}

      <p className="text-right text-[11px] text-ink-600">{connected ? 'Live' : 'Reconnecting…'}</p>
    </div>
  );
}
