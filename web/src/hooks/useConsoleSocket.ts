import { useEffect, useRef, useState } from 'react';
import { wsUrl } from '../api/client.js';
import type { ServerStatus } from '../api/types.js';

export interface LogLine {
  id: number;
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  at: number;
}

export interface Stats {
  memoryMb: number | null;
  cpuPercent: number | null;
}

interface ConsoleState {
  lines: LogLine[];
  status: ServerStatus | null;
  stats: Stats;
  connected: boolean;
  installProgress: { pct: number; message: string } | null;
}

const MAX_LINES = 4000;
let counter = 0;

export function useConsoleSocket(serverId: string | undefined): ConsoleState {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [stats, setStats] = useState<Stats>({ memoryMb: null, cpuPercent: null });
  const [connected, setConnected] = useState(false);
  const [installProgress, setInstallProgress] = useState<{ pct: number; message: string } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(wsUrl(`/ws/console/${serverId}`));
      socketRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) retryTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'hello') {
          setStatus(msg.status);
          if (msg.runtime?.stats) setStats(msg.runtime.stats);
          setLines(
            (msg.history as string[]).map((line) => ({ id: counter++, stream: 'stdout' as const, line, at: Date.now() }))
          );
        } else if (msg.type === 'log') {
          setLines((prev) => {
            const next = [...prev, { id: counter++, stream: msg.stream, line: msg.line, at: msg.at }];
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
        } else if (msg.type === 'status') {
          setStatus(msg.status);
          if (msg.status !== 'installing') setInstallProgress(null);
        } else if (msg.type === 'stats') {
          setStats({ memoryMb: msg.memoryMb, cpuPercent: msg.cpuPercent });
        } else if (msg.type === 'install_progress') {
          setInstallProgress({ pct: msg.pct, message: msg.message });
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [serverId]);

  return { lines, status, stats, connected, installProgress };
}
