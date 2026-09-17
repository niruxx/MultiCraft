import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout } from '../components/Layout.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Button, Card, Skeleton, fadeInUp, staggerContainer } from '../components/ui.js';
import { CreateServerModal } from '../components/CreateServerModal.js';
import { useToast } from '../components/Toast.js';
import { api, ApiError } from '../api/client.js';
import type { ServerRecord } from '../api/types.js';
import { useAuth } from '../state/AuthContext.js';

const PLATFORM_ICON: Record<string, string> = { java: '☕', bedrock: '🪨' };

export function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ servers: ServerRecord[] }>('/servers');
      setServers(res.servers);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load servers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.error(err instanceof ApiError ? err.message : `Failed to ${action} server`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-white">Servers</h1>
            <p className="text-sm text-slate-400">Create, start, and manage your Minecraft servers.</p>
          </div>
          {canCreate && (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              + New Server
            </Button>
          )}
        </motion.div>

        {servers === null ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : servers.length === 0 ? (
          <Card className="p-12 text-center">
            <motion.div
              className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-gradient bg-[length:200%_auto] shadow-glow"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <p className="mb-1 font-semibold text-slate-200">No servers yet</p>
            <p className="mb-5 text-sm text-slate-500">Spin up a Java or Bedrock server in a couple of clicks.</p>
            {canCreate && (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                Create your first server
              </Button>
            )}
          </Card>
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-3">
            {servers.map((server) => (
              <motion.div key={server.id} variants={fadeInUp}>
                <Card hover className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-800 text-lg ring-1 ring-inset ring-surface-700">
                    {PLATFORM_ICON[server.platform]}
                  </div>
                  <Link to={`/servers/${server.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-semibold text-slate-100">{server.name}</h2>
                      <StatusBadge status={server.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
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
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <CreateServerModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => load()} />
    </Layout>
  );
}
