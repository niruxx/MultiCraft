import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import type { RuntimeInfo, ServerRecord } from '../../api/types.js';
import { useAuth } from '../../state/AuthContext.js';

interface ServerDetailState {
  serverId: string;
  server: ServerRecord | null;
  runtime: RuntimeInfo | null;
  running: boolean;
  canWrite: boolean;
  refresh: () => Promise<void>;
}

const ServerDetailContext = createContext<ServerDetailState | null>(null);

export function ServerDetailProvider({ children }: { children: ReactNode }) {
  const { serverId } = useParams<{ serverId: string }>();
  const { user } = useAuth();
  const [server, setServer] = useState<ServerRecord | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [running, setRunning] = useState(false);

  async function refresh() {
    if (!serverId) return;
    const res = await api.get<{ server: ServerRecord; runtime: RuntimeInfo | null; running: boolean }>(
      `/servers/${serverId}`
    );
    setServer(res.server);
    setRuntime(res.runtime);
    setRunning(res.running);
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const canWrite = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <ServerDetailContext.Provider value={{ serverId: serverId!, server, runtime, running, canWrite, refresh }}>
      {children}
    </ServerDetailContext.Provider>
  );
}

export function useServerDetail(): ServerDetailState {
  const ctx = useContext(ServerDetailContext);
  if (!ctx) throw new Error('useServerDetail must be used within ServerDetailProvider');
  return ctx;
}
