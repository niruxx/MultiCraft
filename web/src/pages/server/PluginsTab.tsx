import { useCallback, useEffect, useState } from 'react';
import { useServerDetail } from './ServerContext.js';
import { api, ApiError } from '../../api/client.js';
import type { InstalledPlugin } from '../../api/types.js';
import { useToast } from '../../components/Toast.js';
import { useConfirm } from '../../components/ConfirmDialog.js';
import { PluginSearchModal } from '../../components/PluginSearchModal.js';
import { Badge, Button, Card } from '../../components/ui.js';

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

export function PluginsTab() {
  const { serverId, canWrite } = useServerDetail();
  const toast = useToast();
  const confirm = useConfirm();
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ plugins: InstalledPlugin[] }>(`/servers/${serverId}/plugins`);
      setPlugins(res.plugins);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load plugins');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(plugin: InstalledPlugin) {
    setBusyFile(plugin.fileName);
    try {
      const res = await api.post<{ plugins: InstalledPlugin[] }>(`/servers/${serverId}/plugins/${encodeURIComponent(plugin.fileName)}/toggle`, {
        enabled: !plugin.enabled,
      });
      setPlugins(res.plugins);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to toggle plugin');
    } finally {
      setBusyFile(null);
    }
  }

  async function remove(plugin: InstalledPlugin) {
    const ok = await confirm({
      title: 'Delete plugin',
      message: `Delete ${plugin.displayName}? This can't be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyFile(plugin.fileName);
    try {
      await api.delete(`/servers/${serverId}/plugins/${encodeURIComponent(plugin.fileName)}`);
      toast.success(`Deleted ${plugin.displayName}`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete plugin');
    } finally {
      setBusyFile(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">
          Plugins load from the <span className="font-mono text-ink-300">/plugins</span> folder. Restart the server after
          installing, removing, or toggling one.
        </p>
        {canWrite && (
          <Button variant="primary" onClick={() => setBrowsing(true)}>
            Browse plugins
          </Button>
        )}
      </div>

      <Card className="divide-y divide-surface-800">
        {plugins === null ? (
          <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>
        ) : plugins.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-ink-500">
            No plugins installed yet.
            {canWrite && (
              <div className="mt-3">
                <Button variant="primary" onClick={() => setBrowsing(true)}>
                  Browse plugins
                </Button>
              </div>
            )}
          </div>
        ) : (
          plugins.map((p, i) => (
            <div
              key={p.fileName}
              style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}
              className="animate-fade-in-up flex items-center gap-3 px-4 py-3"
            >
              <span className="text-lg">🧩</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-100">{p.displayName}</p>
                <p className="text-xs text-ink-500">{formatSize(p.sizeBytes)}</p>
              </div>
              <Badge tone={p.enabled ? 'green' : 'neutral'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge>
              {canWrite && (
                <div className="flex gap-1.5">
                  <Button disabled={busyFile === p.fileName} onClick={() => toggle(p)}>
                    {p.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="danger" disabled={busyFile === p.fileName} onClick={() => remove(p)}>
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      <PluginSearchModal open={browsing} onClose={() => setBrowsing(false)} defaultServerId={serverId} onInstalled={load} />
    </div>
  );
}
