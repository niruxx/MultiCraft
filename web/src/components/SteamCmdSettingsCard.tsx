import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import type { SystemSettings } from '../api/types.js';
import { Button, Card, ErrorText, Field, Input } from './ui.js';

export function SteamCmdSettingsCard() {
  const [source, setSource] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<SystemSettings>('/settings')
      .then((res) => setSource(res.steamcmdSource ?? ''))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load settings'))
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await api.put<SystemSettings>('/settings', { steamcmdSource: source });
      setSource(res.steamcmdSource ?? '');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">SteamCMD</h2>
      <p className="mt-1 mb-4 text-xs text-ink-500">
        Controls where MultiCraft gets SteamCMD from when it needs to bootstrap it (the first time a Steam-based
        server is created, or if it's ever removed). Leave this blank to download the official archive from Valve
        automatically — that's the default and works for most installs.
      </p>
      <Field label="SteamCMD source (URL or local path)">
        <Input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={!loaded}
          placeholder="Blank = download from Valve automatically"
        />
      </Field>
      <ul className="mt-2 space-y-1 text-[11px] text-ink-600">
        <li>
          <span className="font-mono text-ink-500">https://…</span> — download from this URL instead of Valve's
          official one (e.g. an internal mirror).
        </li>
        <li>
          <span className="font-mono text-ink-500">/path/to/steamcmd.tar.gz</span> — a local archive already on this
          machine; MultiCraft extracts it directly with no network access at all.
        </li>
        <li>
          <span className="font-mono text-ink-500">/path/to/steamcmd/</span> — a directory that already has SteamCMD
          extracted in it; MultiCraft uses it as-is.
        </li>
      </ul>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={!loaded || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved && <span className="text-sm text-success-500">Saved</span>}
      </div>
    </Card>
  );
}
