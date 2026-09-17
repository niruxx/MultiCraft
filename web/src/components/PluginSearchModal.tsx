import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import type { PluginSearchResult, ResolvedPluginVersion, ServerRecord } from '../api/types.js';
import { PLUGIN_CAPABLE_LOADERS } from '../api/types.js';
import { useToast } from './Toast.js';
import { Button, ErrorText, Input, Modal, Spinner } from './ui.js';

const LOADER_ICON: Record<string, string> = { paper: '📄', purpur: '🟣', spigot: '🥄' };

export function PluginSearchModal({
  open,
  onClose,
  defaultServerId,
  onInstalled,
}: {
  open: boolean;
  onClose: () => void;
  defaultServerId?: string;
  onInstalled?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PluginSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState<PluginSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) return;
    runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onQueryChange(next: string) {
    setQuery(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(next), 350);
  }

  async function runSearch(q: string) {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<{ results: PluginSearchResult[] }>(`/plugins/search?query=${encodeURIComponent(q)}&limit=24`);
      setResults(res.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Modal open={open && !picking} onClose={onClose} title="Browse plugins" size="xl">
        <div className="mb-4">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search plugins (EssentialsX, LuckPerms, WorldEdit…)"
            autoFocus
          />
          <p className="mt-1.5 text-[11px] text-ink-500">
            Results come from Modrinth's plugin catalog (Bukkit / Spigot / Paper / Purpur).
          </p>
        </div>

        <ErrorText>{error}</ErrorText>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500">
            <Spinner /> Searching…
          </div>
        ) : results && results.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-500">No plugins found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {results?.map((r) => (
              <div
                key={r.slug}
                className="flex gap-3 rounded-lg border border-surface-700/80 bg-surface-800/40 p-3 transition-colors hover:border-surface-600"
              >
                {r.iconUrl ? (
                  <img src={r.iconUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-700 text-lg">🧩</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink-100">{r.title}</p>
                  </div>
                  <p className="line-clamp-2 text-xs text-ink-500">{r.description}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-ink-500">
                      {r.downloads.toLocaleString()} downloads · {r.author}
                    </span>
                    <Button className="!px-2.5 !py-1 text-xs" variant="primary" onClick={() => setPicking(r)}>
                      Install
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {picking && (
        <InstallTargetModal
          plugin={picking}
          defaultServerId={defaultServerId}
          onClose={() => setPicking(null)}
          onInstalled={() => {
            setPicking(null);
            onClose();
            onInstalled?.();
          }}
        />
      )}
    </>
  );
}

function InstallTargetModal({
  plugin,
  defaultServerId,
  onClose,
  onInstalled,
}: {
  plugin: PluginSearchResult;
  defaultServerId?: string;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const toast = useToast();
  const [servers, setServers] = useState<ServerRecord[] | null>(null);
  const [selected, setSelected] = useState<string | undefined>(defaultServerId);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ servers: ServerRecord[] }>('/servers')
      .then((res) => {
        const eligible = res.servers.filter((s) => PLUGIN_CAPABLE_LOADERS.includes(s.loader));
        setServers(eligible);
        if (!selected) setSelected(eligible[0]?.id);
      })
      .catch(() => setServers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmInstall() {
    if (!selected) return;
    setInstalling(true);
    setError('');
    try {
      const res = await api.post<{ resolved: ResolvedPluginVersion }>(`/servers/${selected}/plugins/install`, {
        slug: plugin.slug,
      });
      if (res.resolved.versionMismatchWarning) {
        toast.show(`Installed ${res.resolved.fileName} — no build listed for this exact Minecraft version, used the latest instead.`);
      } else {
        toast.success(`Installed ${plugin.title} (${res.resolved.versionNumber})`);
      }
      onInstalled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Install ${plugin.title}`}>
      <div className="space-y-4">
        <p className="text-sm text-ink-400">Which server should this be installed to?</p>
        {servers === null ? (
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <Spinner /> Loading servers…
          </div>
        ) : servers.length === 0 ? (
          <p className="text-sm text-ink-500">
            No Paper, Purpur, or Spigot servers found. Create one first — Vanilla and Bedrock don't support plugins.
          </p>
        ) : (
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {servers.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selected === s.id ? 'border-accent-500/50 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'
                }`}
              >
                <input type="radio" name="target-server" checked={selected === s.id} onChange={() => setSelected(s.id)} />
                <span>{LOADER_ICON[s.loader] ?? '🧩'}</span>
                <span className="min-w-0 flex-1 truncate text-ink-200">{s.name}</span>
                <span className="shrink-0 text-xs text-ink-500">
                  {s.loader} {s.version}
                </span>
              </label>
            ))}
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!selected || installing} onClick={confirmInstall}>
            {installing ? 'Installing…' : 'Install'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
