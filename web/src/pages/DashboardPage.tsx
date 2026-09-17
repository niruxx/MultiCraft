import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Button, Card } from '../components/ui.js';
import { CreateServerModal } from '../components/CreateServerModal.js';
import { api, ApiError } from '../api/client.js';
import type { ServerRecord } from '../api/types.js';
import { useAuth } from '../state/AuthContext.js';

export function DashboardPage() {
  const { user } = useAuth();
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ servers: ServerRecord[] }>('/servers');
      setServers(res.servers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load servers');
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  const canCreate = user?.role === 'admin' || user?.role === 'moderator';

  async function quickAction(id: string, action: 'start' | 'stop' | 'restart') {
    setBusyId(id);
    try {
      await api.post(`/servers/${id}/${action}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} server`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Servers</h1>
            <p className="text-sm text-slate-400">Create, start, and manage your Minecraft servers.</p>
          </div>
          {canCreate && (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              + New Server
            </Button>
          )}
        </div>

        {error && <p className="mb-4 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">{error}</p>}

        {servers === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : servers.length === 0 ? (
          <Card className="p-10 text-center text-slate-400">
            <p className="mb-3">No servers yet.</p>
            {canCreate && (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                Create your first server
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid gap-3">
            {servers.map((server) => (
              <Card key={server.id} className="flex items-center justify-between gap-4 p-4">
                <Link to={`/servers/${server.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold text-slate-100">{server.name}</h2>
                    <StatusBadge status={server.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {server.platform === 'java' ? 'Java' : 'Bedrock'} · {server.loader} {server.version} · port{' '}
                    {server.server_port}
                  </p>
                </Link>
                {canCreate && (
                  <div className="flex shrink-0 gap-2">
                    {server.status === 'stopped' || server.status === 'crashed' ? (
                      <Button disabled={busyId === server.id} onClick={() => quickAction(server.id, 'start')}>
                        Start
                      </Button>
                    ) : server.status === 'running' ? (
                      <>
                        <Button disabled={busyId === server.id} onClick={() => quickAction(server.id, 'restart')}>
                          Restart
                        </Button>
                        <Button variant="danger" disabled={busyId === server.id} onClick={() => quickAction(server.id, 'stop')}>
                          Stop
                        </Button>
                      </>
                    ) : (
                      <Button disabled>{server.status}</Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateServerModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => load()} />
    </Layout>
  );
}
