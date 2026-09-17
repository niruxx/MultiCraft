import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import type { Loader, Platform, ServerRecord, VersionOption } from '../api/types.js';
import { Button, ErrorText, Field, Input, Modal, Select, Spinner } from './ui.js';

const LOADERS_BY_PLATFORM: Record<Platform, { value: Loader; label: string }[]> = {
  java: [
    { value: 'vanilla', label: 'Vanilla' },
    { value: 'paper', label: 'Paper' },
    { value: 'purpur', label: 'Purpur' },
    { value: 'spigot', label: 'Spigot (built from source)' },
  ],
  bedrock: [{ value: 'bedrock', label: 'Bedrock Dedicated Server' }],
};

export function CreateServerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: ServerRecord) => void }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('java');
  const [loader, setLoader] = useState<Loader>('vanilla');
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [version, setVersion] = useState('');
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [minMemoryMb, setMinMemoryMb] = useState(1024);
  const [maxMemoryMb, setMaxMemoryMb] = useState(2048);
  const [serverPort, setServerPort] = useState(25565);
  const [acceptEula, setAcceptEula] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingVersions(true);
    setVersion('');
    api
      .get<{ versions: VersionOption[] }>(`/servers/catalog/versions?loader=${loader}`)
      .then((res) => {
        setVersions(res.versions);
        const recommended = res.versions.find((v) => v.recommended);
        setVersion(recommended?.version ?? res.versions[0]?.version ?? '');
      })
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }, [loader, open]);

  useEffect(() => {
    setServerPort(platform === 'bedrock' ? 19132 : 25565);
    setLoader(LOADERS_BY_PLATFORM[platform][0].value);
  }, [platform]);

  async function submit() {
    setError('');
    if (!name.trim()) return setError('Server name is required');
    if (!version) return setError('Choose a version');
    if (platform === 'java' && !acceptEula) return setError("You must accept Mojang's EULA");
    setSubmitting(true);
    try {
      const { server } = await api.post<{ server: ServerRecord }>('/servers', {
        name: name.trim(),
        platform,
        loader,
        version,
        minMemoryMb,
        maxMemoryMb,
        serverPort,
        acceptEula,
      });
      onCreated(server);
      onClose();
      setName('');
      setAcceptEula(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create server');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a new server">
      <div className="space-y-4">
        <Field label="Server name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Survival Server" autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              <option value="java">Minecraft: Java Edition</option>
              <option value="bedrock">Minecraft: Bedrock Edition</option>
            </Select>
          </Field>
          <Field label="Server software">
            <Select value={loader} onChange={(e) => setLoader(e.target.value as Loader)}>
              {LOADERS_BY_PLATFORM[platform].map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Version">
          {loadingVersions ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Spinner /> Loading versions…
            </div>
          ) : (
            <Select value={version} onChange={(e) => setVersion(e.target.value)}>
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                  {v.recommended ? ' (recommended)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {loader === 'spigot' && (
          <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
            Spigot isn't pre-built — MultiCraft compiles it from source with BuildTools on this machine. That
            requires a full JDK (not just a JRE) and git, and can take several minutes. Watch the Console tab for
            live build output.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Min memory (MB)">
            <Input type="number" value={minMemoryMb} min={512} step={256} onChange={(e) => setMinMemoryMb(Number(e.target.value))} />
          </Field>
          <Field label="Max memory (MB)">
            <Input type="number" value={maxMemoryMb} min={512} step={256} onChange={(e) => setMaxMemoryMb(Number(e.target.value))} />
          </Field>
          <Field label="Port">
            <Input type="number" value={serverPort} onChange={(e) => setServerPort(Number(e.target.value))} />
          </Field>
        </div>

        {platform === 'java' && (
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" className="mt-0.5" checked={acceptEula} onChange={(e) => setAcceptEula(e.target.checked)} />
            <span>
              I have read and accept the{' '}
              <a
                className="text-accent-500 underline"
                href="https://aka.ms/MinecraftEULA"
                target="_blank"
                rel="noreferrer"
              >
                Minecraft End User License Agreement
              </a>
              .
            </span>
          </label>
        )}

        <ErrorText>{error}</ErrorText>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create server'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
