import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError } from '../api/client.js';
import type { DockerConfig, DockerOverview, ServerRecord } from '../api/types.js';
import { Button, ErrorText, Field, Input, Modal, Notice } from './ui.js';
import { APP_ICONS, GameTile, type GameKind } from './GameArt.js';
import { Icon } from './icons.js';
import { DockerEditor, cleanDockerConfig } from './DockerEditor.js';
import { EMPTY_CONTAINER, useCatalog, type CatalogEntry } from './catalog.js';
import { useAuth } from '../state/AuthContext.js';
import { EMPHASIZED } from './motion.js';

/** Catalog icon keys are either app glyphs (APP_ICONS) or game emblem kinds. */
const kindFor = (icon: string): GameKind => (APP_ICONS[icon] ? `app:${icon}` : (icon as GameKind));

/**
 * Creates a container instance: pick a catalog template (apps, Portainer, games) or start from a
 * blank container, then adjust anything before it's created and its image pulled.
 */
export function CreateContainerModal({
  open,
  onClose,
  onCreated,
  initialTemplate,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (s: ServerRecord) => void;
  /** Template id to preselect ('blank' = any image). */
  initialTemplate?: string;
  /** Limit the catalog to these sections. */
  sections?: CatalogEntry['section'][];
}) {
  const catalog = useCatalog();
  const { user, creation } = useAuth();
  const isAdmin = user?.role === 'admin';
  const catalogOnly = !isAdmin && creation?.containers === 'catalog';
  const socketAllowed = isAdmin || !!creation?.engineSocket;
  const [step, setStep] = useState<'pick' | 'configure'>('pick');
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const [config, setConfig] = useState<DockerConfig>(EMPTY_CONTAINER);
  const [name, setName] = useState('');
  const [memoryMb, setMemoryMb] = useState(1024);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [socketHint, setSocketHint] = useState<string | null>(null);

  const entries = useMemo(
    () =>
      (catalog?.entries ?? [])
        .filter((e) => !sections || sections.includes(e.section))
        // Portainer-type templates need engine-socket access.
        .filter((e) => socketAllowed || !e.config.mountEngineSocket)
        .filter((e) => `${e.name} ${e.tagline} ${e.config.image}`.toLowerCase().includes(search.trim().toLowerCase())),
    [catalog, sections, search, socketAllowed]
  );

  function choose(e: CatalogEntry | null) {
    setEntry(e);
    setConfig(structuredClone(e ? e.config : catalog?.blank ?? EMPTY_CONTAINER));
    setMemoryMb(e?.memoryMb ?? 1024);
    setName((prev) => prev || (e ? e.name : ''));
    setStep('configure');
  }

  useEffect(() => {
    if (!open) return;
    setError('');
    setSearch('');
    if (initialTemplate === 'blank') choose(null);
    else if (initialTemplate) {
      const e = catalog?.entries.find((x) => x.id === initialTemplate);
      if (e) choose(e);
    } else setStep('pick');
    api
      .get<DockerOverview>('/docker')
      .then((o) => setSocketHint(o.socket?.path ? null : o.socket?.hint ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplate, catalog]);

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
      setStep('pick');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the instance');
    } finally {
      setBusy(false);
    }
  }

  const grouped = entries.reduce<Record<string, CatalogEntry[]>>((acc, e) => {
    (acc[e.section] ??= []).push(e);
    return acc;
  }, {});

  return (
    <Modal open={open} onClose={onClose} title={step === 'pick' ? 'Choose what to run' : entry ? `New ${entry.name}` : 'New container'} size="xl">
      <AnimatePresence mode="wait" initial={false}>
        {step === 'pick' ? (
          <motion.div key="pick" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2, ease: EMPHASIZED }} className="space-y-5">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the catalog (Portainer, Postgres, Jellyfin…)" autoFocus />
            {Object.entries(grouped).map(([section, list]) => (
              <div key={section}>
                <p className="mb-2 text-xs font-medium text-ink-400">{section}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((e) => (
                    <motion.button
                      key={e.id}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => choose(e)}
                      className="state-layer flex items-start gap-3 rounded-2xl bg-surface-850 p-3 text-left"
                    >
                      <GameTile kind={kindFor(e.icon)} className="h-10 w-10 !rounded-xl" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-50">{e.name}</span>
                        <span className="line-clamp-2 text-xs text-ink-400">{e.tagline}</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
            {!catalogOnly && (!sections?.length || sections.length > 1) ? (
              <button type="button" onClick={() => choose(null)} className="state-layer flex w-full items-center gap-3 rounded-2xl border border-dashed border-surface-500 p-3 text-left">
                <GameTile kind="docker" className="h-10 w-10 !rounded-xl" />
                <span>
                  <span className="block text-sm font-medium text-ink-50">Any image</span>
                  <span className="text-xs text-ink-400">Start from a blank container — Docker Hub, GHCR or your own registry</span>
                </span>
              </button>
            ) : null}
          </motion.div>
        ) : (
          <motion.div key="configure" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2, ease: EMPHASIZED }} className="space-y-5">
            {!initialTemplate && (
              <button type="button" onClick={() => setStep('pick')} className="state-layer inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-accent-400">
                <Icon name="back" className="h-3.5 w-3.5" /> Back to catalog
              </button>
            )}
            {entry?.note && <Notice tone="info">{entry.note}</Notice>}
            {config.mountEngineSocket && socketHint && <Notice tone="warning">{socketHint}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Instance name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My app" />
              </Field>
              <Field label="Memory limit (MB)">
                <Input type="number" min={128} step={128} value={memoryMb} onChange={(e) => setMemoryMb(Number(e.target.value))} />
              </Field>
            </div>
            <DockerEditor value={config} onChange={setConfig} lockImage={catalogOnly && !!entry} allowEngineSocket={socketAllowed} />
            <p className="rounded-2xl bg-tertiary-container px-3 py-2 text-xs text-tertiary-on-container">
              The container only sees this instance's folder (at <span className="font-mono">{config.dataPath || '/data'}</span>)
              {config.volumes?.length ? ' and its listed subfolders' : ''}
              {config.mountEngineSocket ? ', plus the container engine socket' : ''}. It runs with memory and process limits and{' '}
              <span className="font-mono">no-new-privileges</span>. The image is pulled right after you create it.
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
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
