import { useEffect, useState } from 'react';
import { useServerDetail } from './ServerContext.js';
import { api, ApiError } from '../../api/client.js';
import type { PropertyEntry } from '../../api/types.js';
import { Button, Card, ErrorText, Field, Input } from '../../components/ui.js';

export function SettingsTab() {
  const { server, canWrite, refresh } = useServerDetail();
  const [name, setName] = useState('');
  const [minMemoryMb, setMinMemoryMb] = useState(1024);
  const [maxMemoryMb, setMaxMemoryMb] = useState(2048);
  const [serverPort, setServerPort] = useState(25565);
  const [extraJavaArgs, setExtraJavaArgs] = useState('');
  const [extraArgs, setExtraArgs] = useState('');
  const [autoStart, setAutoStart] = useState(false);
  const [serverIp, setServerIp] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!server) return;
    setName(server.name);
    setMinMemoryMb(server.min_memory_mb);
    setMaxMemoryMb(server.max_memory_mb);
    setServerPort(server.server_port);
    setExtraJavaArgs(server.extra_java_args);
    setExtraArgs(server.extra_args);
    setAutoStart(!!server.auto_start);
    if (server.platform === 'java') {
      api
        .get<{ properties: PropertyEntry[] }>(`/servers/${server.id}/properties`)
        .then((res) => setServerIp(res.properties.find((p) => p.key === 'server-ip')?.value ?? ''))
        .catch(() => {});
    }
  }, [server]);

  async function saveGeneral() {
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      await api.patch(`/servers/${server!.id}`, {
        name,
        minMemoryMb,
        maxMemoryMb,
        serverPort,
        extraJavaArgs,
        extraArgs,
        autoStart,
      });
      if (server!.platform === 'java') {
        await api.put(`/servers/${server!.id}/properties`, { updates: { 'server-ip': serverIp } });
      }
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!server) return null;

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-400">General</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Server name">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Port">
            <Input type="number" value={serverPort} onChange={(e) => setServerPort(Number(e.target.value))} disabled={!canWrite} />
          </Field>
          {server.platform === 'java' && (
            <Field label="Bind IP address (server-ip)">
              <Input
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                disabled={!canWrite}
                placeholder="0.0.0.0 (all interfaces)"
              />
            </Field>
          )}
          {server.platform !== 'steam' && (
            <>
              <Field label="Min memory (MB)">
                <Input type="number" value={minMemoryMb} onChange={(e) => setMinMemoryMb(Number(e.target.value))} disabled={!canWrite} />
              </Field>
              <Field label="Max memory (MB)">
                <Input type="number" value={maxMemoryMb} onChange={(e) => setMaxMemoryMb(Number(e.target.value))} disabled={!canWrite} />
              </Field>
            </>
          )}
          {server.platform === 'java' && (
            <Field label="Extra JVM args">
              <Input value={extraJavaArgs} onChange={(e) => setExtraJavaArgs(e.target.value)} disabled={!canWrite} placeholder="-XX:+UseG1GC" />
            </Field>
          )}
          <Field label={server.platform === 'steam' ? 'Extra launch args' : 'Extra server args'}>
            <Input value={extraArgs} onChange={(e) => setExtraArgs(e.target.value)} disabled={!canWrite} />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-ink-300">
          <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} disabled={!canWrite} />
          Automatically start this server when the panel boots
        </label>
        <p className="mt-2 text-xs text-ink-500">
          Memory and argument changes take effect the next time the server starts.
        </p>
        <ErrorText>{saveError}</ErrorText>
        {canWrite && (
          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" onClick={saveGeneral} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {saved && <span className="text-sm text-success-500">Saved</span>}
          </div>
        )}
      </Card>

      {server.platform === 'steam' ? (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-400">Config files</h2>
          <p className="text-sm text-ink-400">
            This game's config files aren't edited here — open the Files tab to view or edit whatever config file
            it writes (INI, JSON, or otherwise).
          </p>
        </Card>
      ) : (
        <PropertiesEditor serverId={server.id} canWrite={canWrite} />
      )}
    </div>
  );
}

function PropertiesEditor({ serverId, canWrite }: { serverId: string; canWrite: boolean }) {
  const [properties, setProperties] = useState<PropertyEntry[] | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ properties: PropertyEntry[] }>(`/servers/${serverId}/properties`);
      setProperties(res.properties);
      setEdited({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load properties');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function save() {
    if (Object.keys(edited).length === 0) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await api.put<{ properties: PropertyEntry[] }>(`/servers/${serverId}/properties`, { updates: edited });
      setProperties(res.properties);
      setEdited({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save properties');
    } finally {
      setSaving(false);
    }
  }

  if (!properties) return <p className="text-sm text-ink-500">Loading properties…</p>;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">server.properties</h2>
        <p className="text-xs text-ink-500">Restart the server for changes to take effect.</p>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-md border border-surface-700">
        <table className="w-full text-sm">
          <tbody>
            {properties.map((p) => (
              <tr key={p.key} className="border-b border-surface-800 last:border-0">
                <td className="w-1/3 px-3 py-1.5 font-mono text-xs text-ink-400">{p.key}</td>
                <td className="px-3 py-1.5">
                  <input
                    className="w-full rounded bg-transparent px-1 py-0.5 font-mono text-xs text-ink-100 focus:bg-surface-800 focus:outline-none"
                    defaultValue={p.value}
                    disabled={!canWrite}
                    onChange={(e) => setEdited((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <div className="mt-3 flex items-end gap-2">
          <Field label="New key">
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="motd" />
          </Field>
          <Field label="Value">
            <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          </Field>
          <Button
            onClick={() => {
              if (!newKey.trim()) return;
              setEdited((prev) => ({ ...prev, [newKey.trim()]: newValue }));
              setProperties((prev) => [...(prev ?? []), { key: newKey.trim(), value: newValue }]);
              setNewKey('');
              setNewValue('');
            }}
          >
            Add
          </Button>
        </div>
      )}

      <ErrorText>{error}</ErrorText>

      {canWrite && (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={saving || Object.keys(edited).length === 0}>
            {saving ? 'Saving…' : `Save ${Object.keys(edited).length || ''} change(s)`}
          </Button>
          {saved && <span className="text-sm text-success-500">Saved</span>}
        </div>
      )}
    </Card>
  );
}
