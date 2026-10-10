import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Layout, PageHeader } from '../components/Layout.js';
import { StatusBadge, SuspendedBadge } from '../components/StatusBadge.js';
import { Badge, Button, Card, CardTitle, ErrorText, Field, Input, Modal, Notice, Spinner } from '../components/ui.js';
import { GameTile, gameKindOf } from '../components/GameArt.js';
import { Icon } from '../components/icons.js';
import { DOCKER_PRESETS, DockerEditor, cleanDockerConfig, type DockerPreset } from '../components/DockerEditor.js';
import { formatBytes, formatDuration } from '../components/HostOverview.js';
import { EMPHASIZED } from '../components/motion.js';
import { useToast } from '../components/Toast.js';
import { api, ApiError } from '../api/client.js';
import type { DockerConfig, DockerOverview, InstanceListMetrics, ServerRecord } from '../api/types.js';
import { useAuth } from '../state/AuthContext.js';

function EngineCard({ overview, refreshing, onRefresh }: { overview: DockerOverview | null; refreshing: boolean; onRefresh: () => void }) {
  const engine = overview?.engine;
  return (
    <Card className="p-5">
      <CardTitle
        action={
          <Button variant="ghost" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />} Refresh
          </Button>
        }
      >
        Container engine
      </CardTitle>
      {!engine ? (
        <Spinner />
      ) : engine.available ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#173450] text-[#7cc0ff]">
              <Icon name="container" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-base capitalize text-ink-50">
                {engine.engine} <span className="text-ink-400">{engine.version}</span>
              </p>
              <div className="mt-0.5 flex gap-1.5">
                <Badge tone="green">Connected</Badge>
                {engine.rootless && <Badge tone="blue">Rootless</Badge>}
              </div>
            </div>
          </div>
          {overview?.counts && (
            <div className="flex gap-6 text-sm">
              {[
                ['Running', overview.counts.running],
                ['Containers', overview.counts.containers],
                ['Images', overview.counts.images],
              ].map(([label, n]) => (
                <div key={label as string}>
                  <p className="text-2xl text-ink-50">{n}</p>
                  <p className="text-xs text-ink-400">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Notice tone="warning">
          <p className="font-medium">{engine.error}</p>
          {engine.hint && <p className="mt-1">{engine.hint}</p>}
        </Notice>
      )}
    </Card>
  );
}

function DockerRow({ server, metrics }: { server: ServerRecord; metrics: InstanceListMetrics | undefined }) {
  let config: DockerConfig | null = null;
  try {
    config = server.docker_config ? JSON.parse(server.docker_config) : null;
  } catch {
    config = null;
  }
  const stats = metrics?.runtime?.stats;
  return (
    <Card hover className="relative p-4">
      <Link to={`/instances/${server.id}`} aria-label={`Open ${server.name}`} className="absolute inset-0 rounded-[inherit]" />
      <div className="flex flex-wrap items-center gap-4">
        <GameTile kind={gameKindOf(server)} className="h-12 w-12" running={server.status === 'running'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-medium text-ink-50">{server.name}</h2>
            {server.suspended ? <SuspendedBadge /> : <StatusBadge status={server.status} />}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-400">{server.version}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {config?.ports.map((p, i) => (
            <span key={i} className="rounded-lg bg-surface-900 px-2 py-0.5 font-mono text-xs text-ink-300">
              {p.host}→{p.container}/{p.protocol}
            </span>
          ))}
        </div>
        <div className="flex gap-4 text-xs text-ink-300 tabular-nums">
          <span title="CPU">{stats?.cpuPercent != null ? `${stats.cpuPercent}%` : '—'}</span>
          <span title="Memory">{stats?.memoryMb != null ? formatBytes(stats.memoryMb * 1048576) : '—'}</span>
          <span title="Network in / out">
            {stats?.netRxRate != null ? `↓${formatBytes(stats.netRxRate)}/s ↑${formatBytes(stats.netTxRate ?? 0)}/s` : '—'}
          </span>
          <span title="Uptime">{metrics?.runtime ? formatDuration(metrics.runtime.uptimeMs / 1000) : ''}</span>
        </div>
      </div>
    </Card>
  );
}

function CreateDockerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: ServerRecord) => void }) {
  const [preset, setPreset] = useState<DockerPreset>(DOCKER_PRESETS[0]);
  const [config, setConfig] = useState<DockerConfig>(DOCKER_PRESETS[0].config);
  const [name, setName] = useState('');
  const [memoryMb, setMemoryMb] = useState(DOCKER_PRESETS[0].memoryMb);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function choose(p: DockerPreset) {
    setPreset(p);
    setConfig(structuredClone(p.config));
    setMemoryMb(p.memoryMb);
  }

  async function submit() {
    setError('');
    if (!name.trim()) return setError('Give the instance a name');
    if (!config.image.trim()) return setError('Enter an image');
    setBusy(true);
    try {
      const { server } = await api.post<{ server: ServerRecord }>('/servers', {
        name: name.trim(),
        platform: 'docker',
        loader: 'docker',
        minMemoryMb: Math.min(1024, memoryMb),
        maxMemoryMb: memoryMb,
        docker: cleanDockerConfig(config),
      });
      onCreated(server);
      onClose();
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the instance');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Docker instance" size="xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DOCKER_PRESETS.map((p) => (
            <motion.button
              key={p.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => choose(p)}
              className={`state-layer rounded-2xl border p-3 text-left ${preset.id === p.id ? 'border-accent-400 bg-accent-container/40' : 'border-surface-600'}`}
            >
              <p className="text-sm font-medium text-ink-50">
                {p.emoji} {p.label}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{p.description}</p>
            </motion.button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instance name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My container server" autoFocus />
          </Field>
          <Field label="Memory limit (MB)">
            <Input type="number" min={256} step={256} value={memoryMb} onChange={(e) => setMemoryMb(Number(e.target.value))} />
          </Field>
        </div>

        <DockerEditor value={config} onChange={setConfig} />

        <p className="rounded-2xl bg-tertiary-container px-3 py-2 text-xs text-tertiary-on-container">
          The container only sees this instance's folder (at <span className="font-mono">{config.dataPath || '/data'}</span>). It runs with a memory
          limit, a process limit and <span className="font-mono">no-new-privileges</span>. The image is pulled right after you create it.
        </p>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create & pull image'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** The Docker page: engine status + only the container-backed instances. */
export function DockerPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [overview, setOverview] = useState<DockerOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [metrics, setMetrics] = useState<Record<string, InstanceListMetrics>>({});
  const [createOpen, setCreateOpen] = useState(false);

  const loadEngine = useCallback(async (refresh = false) => {
    setRefreshing(true);
    try {
      setOverview(await api.get<DockerOverview>(`/docker${refresh ? '?refresh=1' : ''}`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reach the container engine');
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInstances = useCallback(async () => {
    try {
      const res = await api.get<{ servers: ServerRecord[]; metrics: Record<string, InstanceListMetrics> }>('/servers');
      setServers(res.servers.filter((s) => s.platform === 'docker'));
      setMetrics(res.metrics ?? {});
    } catch {
      // the list keeps its last value
    }
  }, []);

  useEffect(() => {
    loadEngine();
    loadInstances();
    const t = setInterval(loadInstances, 4000);
    return () => clearInterval(t);
  }, [loadEngine, loadInstances]);

  const managed = overview?.containers ?? [];

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-8">
        <PageHeader
          title="Docker"
          subtitle="Game servers isolated in containers — each one only sees its own folder."
          action={
            isAdmin && (
              <Button variant="primary" onClick={() => setCreateOpen(true)} disabled={!overview?.engine.available}>
                <Icon name="plus" className="h-4 w-4" /> New Docker instance
              </Button>
            )
          }
        />

        <EngineCard overview={overview} refreshing={refreshing} onRefresh={() => loadEngine(true)} />

        <div>
          <h2 className="mb-3 text-base font-medium text-ink-100">{servers ? `${servers.length} container instance${servers.length === 1 ? '' : 's'}` : 'Container instances'}</h2>
          {servers === null ? (
            <Spinner />
          ) : servers.length === 0 ? (
            <Card className="p-10 text-center">
              <GameTile kind="docker" className="mx-auto mb-3 h-14 w-14" />
              <p className="mb-1 text-base font-medium text-ink-100">No container instances yet</p>
              <p className="text-sm text-ink-400">
                {isAdmin ? 'Create one from a ready-made game image or any image you like.' : 'An admin can create container instances here.'}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {servers.map((s, i) => (
                  <motion.div key={s.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04, ease: EMPHASIZED }}>
                    <DockerRow server={s} metrics={metrics[s.id]} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {isAdmin && managed.length > 0 && (
          <Card className="p-5">
            <CardTitle>Containers started by MultiCraft</CardTitle>
            <p className="mb-3 text-sm text-ink-400">Labelled <span className="font-mono">multicraft.instance</span> on the engine — useful for spotting leftovers after a panel restart.</p>
            <div className="space-y-1 font-mono text-xs text-ink-300">
              {managed.map((c) => (
                <p key={c.name}>
                  {c.name} · {c.image} · {c.status}
                </p>
              ))}
            </div>
          </Card>
        )}
      </div>

      <CreateDockerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(s) => {
          toast.success(`Pulling ${s.version}…`);
          navigate(`/instances/${s.id}/console`);
        }}
      />
    </Layout>
  );
}
