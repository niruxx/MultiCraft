import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layout, PageHeader } from '../components/Layout.js';
import { StatusBadge, SuspendedBadge } from '../components/StatusBadge.js';
import { Button, Card, Skeleton, fadeInUp, staggerContainer } from '../components/ui.js';
import { CreateServerModal } from '../components/CreateServerModal.js';
import { gameLabel, GameTile, gameKindOf } from '../components/GameArt.js';
import { Icon } from '../components/icons.js';
import { useToast } from '../components/Toast.js';
import { api, ApiError } from '../api/client.js';
import type { ServerRecord } from '../api/types.js';
import { useAuth } from '../state/AuthContext.js';

export function InstancesPage() {
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
      toast.error(err instanceof ApiError ? err.message : 'Failed to load instances');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  const canCreate = user?.role === 'admin' || user?.role === 'moderator';
  const running = servers?.filter((s) => s.status === 'running').length ?? 0;

  async function quickAction(id: string, action: 'start' | 'stop' | 'restart' | 'retry-install') {
    setBusyId(id);
    try {
      await api.post(`/servers/${id}/${action}`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${action.replace('-', ' ')} instance`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <PageHeader
          title="Instances"
          subtitle={servers ? `${servers.length} instance${servers.length === 1 ? '' : 's'} · ${running} running` : 'Loading…'}
          action={
            canCreate && (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" className="h-4 w-4" />
                New instance
              </Button>
            )
          }
        />

        {servers === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-12 w-12 shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : servers.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="mx-auto mb-4 flex w-fit gap-2">
              <GameTile kind="minecraft-java" className="h-12 w-12" />
              <GameTile kind="valheim" className="h-12 w-12" />
              <GameTile kind="palworld" className="h-12 w-12" />
            </div>
            <p className="mb-1 text-base font-medium text-ink-100">No instances yet</p>
            <p className="mb-5 text-sm text-ink-400">Spin up a Minecraft or Steam game server in a couple of clicks.</p>
            {canCreate && (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                Create your first instance
              </Button>
            )}
          </Card>
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-3 md:grid-cols-2">
            {servers.map((server) => {
              const kind = gameKindOf(server);
              const busy = busyId === server.id;
              return (
                <motion.div key={server.id} variants={fadeInUp}>
                  <Card hover className="flex items-center gap-4 p-4">
                    <GameTile kind={kind} className="h-12 w-12" running={server.status === 'running'} />
                    <Link to={`/instances/${server.id}`} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-medium text-ink-50">{server.name}</h2>
                        {server.suspended ? <SuspendedBadge /> : <StatusBadge status={server.status} />}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-400">
                        {gameLabel(kind)}
                        {server.platform !== 'steam' && ` · ${server.loader} ${server.version}`} · port {server.server_port}
                      </p>
                    </Link>
                    {canCreate && !server.suspended && (
                      <div className="flex shrink-0 gap-1">
                        {server.status === 'install_failed' ? (
                          <Button disabled={busy} onClick={() => quickAction(server.id, 'retry-install')}>
                            Retry
                          </Button>
                        ) : server.status === 'stopped' || server.status === 'crashed' ? (
                          <IconAction icon="play" label="Start" disabled={busy} onClick={() => quickAction(server.id, 'start')} />
                        ) : server.status === 'running' ? (
                          <>
                            <IconAction icon="restart" label="Restart" disabled={busy} onClick={() => quickAction(server.id, 'restart')} />
                            <IconAction icon="stop" label="Stop" danger disabled={busy} onClick={() => quickAction(server.id, 'stop')} />
                          </>
                        ) : null}
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <CreateServerModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => load()} />
    </Layout>
  );
}

/** MD3 filled-tonal icon button. */
export function IconAction({
  icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`state-layer flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-[0.38] ${
        danger ? 'bg-error-container text-error-on-container' : 'bg-secondary-container text-secondary-on-container'
      }`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
    </button>
  );
}
