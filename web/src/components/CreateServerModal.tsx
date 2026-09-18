import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import type { Loader, Platform, ServerRecord, SteamGameOption, VersionOption } from '../api/types.js';
import { Button, ErrorText, Field, Input, Modal, Select, Spinner } from './ui.js';

const LOADERS_BY_PLATFORM: Record<Platform, { value: Loader; label: string }[]> = {
  java: [
    { value: 'vanilla', label: 'Vanilla' },
    { value: 'paper', label: 'Paper' },
    { value: 'purpur', label: 'Purpur' },
    { value: 'spigot', label: 'Spigot (built from source)' },
  ],
  bedrock: [{ value: 'bedrock', label: 'Bedrock Dedicated Server' }],
  steam: [{ value: 'steam', label: 'Steam Dedicated Server' }],
};

const CUSTOM_STEAM_GAME = '__custom__';

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
  const [steamGames, setSteamGames] = useState<SteamGameOption[]>([]);
  const [steamGameChoice, setSteamGameChoice] = useState<string>(CUSTOM_STEAM_GAME);
  const [customAppId, setCustomAppId] = useState('');
  const [customExecutable, setCustomExecutable] = useState('');
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
    if (!open || platform !== 'steam') return;
    api
      .get<{ games: SteamGameOption[] }>('/servers/catalog/steam-games')
      .then((res) => {
        setSteamGames(res.games);
        if (res.games[0]) {
          setSteamGameChoice(res.games[0].id);
          setServerPort(res.games[0].defaultPort);
        }
      })
      .catch(() => setSteamGames([]));
  }, [platform, open]);

  useEffect(() => {
    setServerPort(platform === 'bedrock' ? 19132 : 25565);
    setLoader(LOADERS_BY_PLATFORM[platform][0].value);
  }, [platform]);

  const selectedSteamGame = steamGames.find((g) => g.id === steamGameChoice);

  function selectSteamGame(id: string) {
    setSteamGameChoice(id);
    const game = steamGames.find((g) => g.id === id);
    if (game) setServerPort(game.defaultPort);
  }

  async function submit() {
    setError('');
    if (!name.trim()) return setError('Server name is required');
    if (!version) return setError('Choose a version');
    if (platform === 'java' && !acceptEula) return setError("You must accept Mojang's EULA");
    if (platform === 'steam' && steamGameChoice === CUSTOM_STEAM_GAME) {
      if (!/^\d+$/.test(customAppId.trim())) return setError('Enter a numeric Steam App ID');
      if (!customExecutable.trim()) return setError('Enter the relative path to the server executable');
    }
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
        steamAppId: platform === 'steam' ? (selectedSteamGame ? selectedSteamGame.appId : customAppId.trim()) : undefined,
        customExecutable: platform === 'steam' && !selectedSteamGame ? customExecutable.trim() : undefined,
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
              <option value="steam">Steam Dedicated Server</option>
            </Select>
          </Field>
          {platform !== 'steam' && (
            <Field label="Server software">
              <Select value={loader} onChange={(e) => setLoader(e.target.value as Loader)}>
                {LOADERS_BY_PLATFORM[platform].map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {platform === 'steam' && (
            <Field label="Game">
              <Select value={steamGameChoice} onChange={(e) => selectSteamGame(e.target.value)}>
                {steamGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
                <option value={CUSTOM_STEAM_GAME}>Other (custom App ID)</option>
              </Select>
            </Field>
          )}
        </div>

        {platform === 'steam' && steamGameChoice === CUSTOM_STEAM_GAME && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Steam App ID">
              <Input value={customAppId} onChange={(e) => setCustomAppId(e.target.value)} placeholder="e.g. 380870" />
            </Field>
            <Field label="Server executable (relative path)">
              <Input
                value={customExecutable}
                onChange={(e) => setCustomExecutable(e.target.value)}
                placeholder="e.g. MyServer.exe"
              />
            </Field>
          </div>
        )}

        {platform === 'steam' && selectedSteamGame?.notes && (
          <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
            {selectedSteamGame.notes}
          </p>
        )}

        {platform === 'steam' && steamGameChoice === CUSTOM_STEAM_GAME && (
          <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
            Custom App IDs are best-effort: MultiCraft doesn't know this game's launch behavior, so it will send
            SIGTERM to stop it (falling back to a forced stop after 60s) and mark it "running" as soon as the
            process starts. Config files are edited via the Files tab.
          </p>
        )}

        {platform !== 'steam' && (
          <Field label="Version">
            {loadingVersions ? (
              <div className="flex items-center gap-2 text-sm text-ink-400">
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
        )}

        {loader === 'spigot' && (
          <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
            Spigot isn't pre-built — MultiCraft compiles it from source with BuildTools on this machine. That
            requires a full JDK (not just a JRE) and git, and can take several minutes. Watch the Console tab for
            live build output.
          </p>
        )}

        <div className={platform === 'steam' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-3'}>
          {platform !== 'steam' && (
            <>
              <Field label="Min memory (MB)">
                <Input type="number" value={minMemoryMb} min={512} step={256} onChange={(e) => setMinMemoryMb(Number(e.target.value))} />
              </Field>
              <Field label="Max memory (MB)">
                <Input type="number" value={maxMemoryMb} min={512} step={256} onChange={(e) => setMaxMemoryMb(Number(e.target.value))} />
              </Field>
            </>
          )}
          <Field label="Port">
            <Input type="number" value={serverPort} onChange={(e) => setServerPort(Number(e.target.value))} />
          </Field>
        </div>

        {platform === 'java' && (
          <label className="flex items-start gap-2 text-sm text-ink-300">
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
