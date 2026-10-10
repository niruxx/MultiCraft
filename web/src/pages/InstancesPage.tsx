import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Layout, PageHeader } from '../components/Layout.js';
import { StatusBadge, SuspendedBadge } from '../components/StatusBadge.js';
import { Button, Card, Skeleton } from '../components/ui.js';
import { CreateServerModal } from '../components/CreateServerModal.js';
import { GameTile, gameKindOf, gameLabel } from '../components/GameArt.js';
import { HostOverview, formatBytes, formatDuration } from '../components/HostOverview.js';
import { MiniBar } from '../components/charts.js';
import { EMPHASIZED } from '../components/motion.js';
import { Icon, type IconName } from '../components/icons.js';
import { useToast } from '../components/Toast.js';
import { api, ApiError } from '../api/client.js';
import type { InstanceListMetrics, ServerRecord } from '../api/types.js';
import { useAuth } from '../state/AuthContext.js';

type ViewMode = 'list' | 'grid' | 'box';
const VIEW_KEY = 'multicraft_instances_view';
const VIEWS: { mode: ViewMode; icon: IconName; label: string }[] = [
  { mode: 'list', icon: 'list', label: 'List' },
  { mode: 'grid', icon: 'grid', label: 'Grid' },
  { mode: 'box', icon: 'box', label: 'Box' },
];

function readView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'list' || v === 'grid' || v === 'box' ? v : 'grid';
  } catch {
    return 'grid';
  }
}

/** MD3 segmented button for the view mode. */
function ViewSwitcher({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex rounded-full border border-surface-500 p-0.5" role="radiogroup" aria-label="View mode">
      {VIEWS.map((v) => (
        <button
          key={v.mode}
          role="radio"
          aria-checked={mode === v.mode}
          onClick={() => onChange(v.mode)}
          className={`state-layer relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
            mode === v.mode ? 'text-secondary-on-container' : 'text-ink-300'
          }`}
        >
          {mode === v.mode && (
            <motion.span
              layoutId="view-switch-pill"
              className="absolute inset-0 rounded-full bg-secondary-container"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <Icon name={v.icon} className="h-4 w-4" />
            <span className="hidden sm:inline">{v.label}</span>
          </span>
        </button>
      ))}
    </div>
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
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`state-layer flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-[0.38] ${
        danger ? 'bg-error-container text-error-on-container' : 'bg-secondary-container text-secondary-on-container'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </motion.button>
  );
}

interface RowProps {
  server: ServerRecord;
  metrics: InstanceListMetrics | undefined;
  hostMemMb: number | null;
  canAct: boolean;
  busy: boolean;
  act: (id: string, action: 'start' | 'stop' | 'restart' | 'retry-install') => void;
}

/** CPU / RAM / players / uptime for one instance, computed once for every view. */
function useInstanceFigures({ server, metrics, hostMemMb }: Pick<RowProps, 'server' | 'metrics' | 'hostMemMb'>) {
  const stats = metrics?.runtime?.stats;
  const memLimit = server.platform === 'java' ? server.max_memory_mb : hostMemMb;
  return {
    live: !!metrics?.runtime,
    cpu: stats?.cpuPercent ?? null,
    memMb: stats?.memoryMb ?? null,
    memPct: stats?.memoryMb != null && memLimit ? (stats.memoryMb / memLimit) * 100 : null,
    memLimit,
    players: metrics?.playersOnline ?? null,
    uptime: metrics?.runtime ? formatDuration(metrics.runtime.uptimeMs / 1000) : null,
  };
}

function Actions({ server, canAct, busy, act }: Pick<RowProps, 'server' | 'canAct' | 'busy' | 'act'>) {
  if (!canAct || server.suspended) return null;
  if (server.status === 'install_failed')
    return <IconAction icon="restart" label="Retry install" disabled={busy} onClick={() => act(server.id, 'retry-install')} />;
  if (server.status === 'stopped' || server.status === 'crashed')
    return <IconAction icon="play" label="Start" disabled={busy} onClick={() => act(server.id, 'start')} />;
  if (server.status === 'running')
    return (
      <>
        <IconAction icon="restart" label="Restart" disabled={busy} onClick={() => act(server.id, 'restart')} />
        <IconAction icon="stop" label="Stop" danger disabled={busy} onClick={() => act(server.id, 'stop')} />
      </>
    );
  return null;
}

/** Whole-card link without nesting buttons in an anchor: the link covers the card, actions sit above it. */
function StretchedLink({ server }: { server: ServerRecord }) {
  return <Link to={`/instances/${server.id}`} aria-label={`Open ${server.name}`} className="absolute inset-0 z-0 rounded-[inherit]" />;
}

function Badge({ server }: { server: ServerRecord }) {
  return server.suspended ? <SuspendedBadge /> : <StatusBadge status={server.status} />;
}

function subtitle(server: ServerRecord) {
  const kind = gameKindOf(server);
  const version = server.platform === 'java' || server.platform === 'bedrock' ? ` · ${server.loader} ${server.version}` : '';
  return `${gameLabel(kind)}${version} · port ${server.server_port}`;
}

function Metric({ icon, value, title }: { icon: IconName; value: string; title: string }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={title}>
      <Icon name={icon} className="h-3.5 w-3.5 text-ink-500" />
      {value}
    </span>
  );
}

function ListRow(props: RowProps) {
  const { server } = props;
  const f = useInstanceFigures(props);
  return (
    <div className="state-layer relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5 md:grid-cols-[auto_minmax(0,2fr)_110px_90px_90px_70px_80px_auto]">
      <StretchedLink server={server} />
      <GameTile kind={gameKindOf(server)} className="h-9 w-9 !rounded-xl" running={server.status === 'running'} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-50">{server.name}</p>
        <p className="truncate text-xs text-ink-400">{subtitle(server)}</p>
      </div>
      <div className="hidden md:block">
        <Badge server={server} />
      </div>
      <span className="hidden text-xs text-ink-300 md:block">{f.cpu !== null ? `${f.cpu}% CPU` : '—'}</span>
      <span className="hidden text-xs text-ink-300 md:block">{f.memMb !== null ? formatBytes(f.memMb * 1048576) : '—'}</span>
      <span className="hidden text-xs text-ink-300 md:block">{f.players !== null && f.live ? `${f.players} online` : '—'}</span>
      <span className="hidden text-xs text-ink-300 md:block">{f.uptime ?? '—'}</span>
      <div className="relative z-10 flex gap-1">
        <span className="md:hidden">
          <Badge server={server} />
        </span>
        <Actions {...props} />
      </div>
    </div>
  );
}

function GridCard(props: RowProps) {
  const { server } = props;
  const f = useInstanceFigures(props);
  return (
    <Card hover className="relative flex h-full flex-col gap-3 p-4">
      <StretchedLink server={server} />
        <div className="flex items-center gap-3">
          <GameTile kind={gameKindOf(server)} className="h-12 w-12" running={server.status === 'running'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-medium text-ink-50">{server.name}</h2>
              <Badge server={server} />
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-400">{subtitle(server)}</p>
          </div>
          <div className="relative z-10 flex shrink-0 gap-1">
            <Actions {...props} />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-surface-700 pt-3 text-xs text-ink-300">
          {f.live ? (
            <>
              <Metric icon="cpu" title="CPU" value={f.cpu !== null ? `${f.cpu}%` : '…'} />
              <Metric icon="memory" title="Memory" value={f.memMb !== null ? formatBytes(f.memMb * 1048576) : '…'} />
              {f.players !== null && <Metric icon="player" title="Players online" value={`${f.players} online`} />}
              <Metric icon="clock" title="Uptime" value={f.uptime ?? '…'} />
            </>
          ) : (
            <span className="text-ink-500">Not running</span>
          )}
        </div>
    </Card>
  );
}

function BoxCard(props: RowProps) {
  const { server } = props;
  const f = useInstanceFigures(props);
  const kind = gameKindOf(server);
  return (
    <Card hover className="relative flex h-full flex-col overflow-hidden">
      <StretchedLink server={server} />
        <div className="relative flex h-28 items-center justify-center bg-surface-900">
          <GameTile kind={kind} className="h-20 w-20 !rounded-3xl shadow-card" running={server.status === 'running'} />
          <div className="absolute right-3 top-3">
            <Badge server={server} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium text-ink-50">{server.name}</h2>
            <p className="truncate text-xs text-ink-400">{subtitle(server)}</p>
          </div>
          <div className="space-y-2 text-xs text-ink-300">
            <div>
              <div className="mb-1 flex justify-between">
                <span>CPU</span>
                <span className="tabular-nums">{f.cpu !== null ? `${f.cpu}%` : '—'}</span>
              </div>
              <MiniBar percent={f.cpu} color="#78dc77" />
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <span>Memory</span>
                <span className="tabular-nums">
                  {f.memMb !== null ? formatBytes(f.memMb * 1048576) : '—'}
                  {f.memLimit ? ` / ${formatBytes(f.memLimit * 1048576)}` : ''}
                </span>
              </div>
              <MiniBar percent={f.memPct} color="#a1ced7" />
            </div>
            <div className="flex justify-between pt-1 text-ink-400">
              <span>{f.players !== null && f.live ? `${f.players} players online` : f.live ? 'Running' : 'Offline'}</span>
              <span className="tabular-nums">{f.uptime ?? ''}</span>
            </div>
          </div>
          <div className="relative z-10 mt-auto flex justify-end gap-1">
            <Actions {...props} />
          </div>
        </div>
    </Card>
  );
}

const CONTAINER: Record<ViewMode, string> = {
  list: 'flex flex-col gap-1 rounded-3xl bg-surface-850 p-2',
  grid: 'grid gap-3 md:grid-cols-2 2xl:grid-cols-3',
  box: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
};

export function InstancesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [metrics, setMetrics] = useState<Record<string, InstanceListMetrics>>({});
  const [hostMemMb, setHostMemMb] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(readView);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ servers: ServerRecord[]; metrics: Record<string, InstanceListMetrics> }>('/servers');
      setServers(res.servers);
      setMetrics(res.metrics ?? {});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load instances');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    api.get<{ totalMemMb: number }>('/system').then((s) => setHostMemMb(s.totalMemMb)).catch(() => {});
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // per-viewer preference only
    }
  }

  const canCreate = user?.role === 'admin' || user?.role === 'moderator';

  async function act(id: string, action: 'start' | 'stop' | 'restart' | 'retry-install') {
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

  const Row = view === 'list' ? ListRow : view === 'grid' ? GridCard : BoxCard;

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <PageHeader
          title="Instances"
          subtitle="Everything running on this host, at a glance."
          action={
            canCreate && (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" className="h-4 w-4" />
                New instance
              </Button>
            )
          }
        />

        <HostOverview />

        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-ink-100">
            {servers ? `${servers.length} instance${servers.length === 1 ? '' : 's'}` : 'Instances'}
          </h2>
          <ViewSwitcher mode={view} onChange={changeView} />
        </div>

        {servers === null ? (
          <div className={CONTAINER.grid}>
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
              {(['minecraft-java', 'valheim', 'palworld', 'custom'] as const).map((k, i) => (
                <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, ease: EMPHASIZED }}>
                  <GameTile kind={k} className="h-12 w-12" />
                </motion.div>
              ))}
            </div>
            <p className="mb-1 text-base font-medium text-ink-100">No instances yet</p>
            <p className="mb-5 text-sm text-ink-400">Spin up a Minecraft, Steam or custom game server in a couple of clicks.</p>
            {canCreate && (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                Create your first instance
              </Button>
            )}
          </Card>
        ) : (
          <LayoutGroup>
            <motion.div layout className={CONTAINER[view]} transition={{ duration: 0.35, ease: EMPHASIZED }}>
              <AnimatePresence mode="popLayout">
                {servers.map((server, i) => (
                  <motion.div
                    key={`${view}-${server.id}`}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.35, ease: EMPHASIZED, delay: Math.min(i, 12) * 0.035 }}
                  >
                    <Row
                      server={server}
                      metrics={metrics[server.id]}
                      hostMemMb={hostMemMb}
                      canAct={canCreate}
                      busy={busyId === server.id}
                      act={act}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
        )}
      </div>

      <CreateServerModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => load()} />
    </Layout>
  );
}
