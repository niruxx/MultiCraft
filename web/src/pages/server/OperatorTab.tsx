import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useServerDetail } from './ServerContext.js';
import { api, ApiError } from '../../api/client.js';
import { useToast } from '../../components/Toast.js';
import { Button, Card, Field, Input, Select } from '../../components/ui.js';

function QuickCommandRow({
  label,
  hint,
  options,
  disabled,
  onRun,
}: {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onRun: (value: string) => void;
}) {
  const [value, setValue] = useState(options[0]?.value ?? '');
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-surface-800 py-3 last:border-0">
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-medium text-ink-200">{label}</p>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
      <Select className="w-44" value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Button disabled={disabled} onClick={() => onRun(value)}>
        Apply
      </Button>
    </div>
  );
}

export function OperatorTab() {
  const { serverId, running, canWrite, server } = useServerDetail();
  const toast = useToast();
  const [broadcast, setBroadcast] = useState('');
  const [busy, setBusy] = useState(false);

  const [targetName, setTargetName] = useState('');
  const [reason, setReason] = useState('');

  async function run(command: string, successMessage: string) {
    setBusy(true);
    try {
      await api.post(`/servers/${serverId}/command`, { command });
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Command failed');
    } finally {
      setBusy(false);
    }
  }

  async function moderate(action: 'kick' | 'ban' | 'pardon') {
    if (!targetName.trim()) return toast.error('Enter a player name');
    setBusy(true);
    try {
      await api.post(`/servers/${serverId}/players/${encodeURIComponent(targetName.trim())}/${action}`, reason ? { reason } : undefined);
      toast.success(`${action === 'ban' ? 'Banned' : action === 'kick' ? 'Kicked' : 'Pardoned'} ${targetName.trim()}`);
      setTargetName('');
      setReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !running || !canWrite || busy;
  const isJava = server?.platform === 'java';

  return (
    <div className="space-y-6">
      {!running && (
        <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400">
          Start the server to use operator tools — these actions run through the live console.
        </p>
      )}

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-400">Broadcast</h2>
        <p className="mb-3 text-xs text-ink-500">Send a message to everyone currently online.</p>
        <div className="flex gap-2">
          <Input
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            placeholder="Server restarting in 5 minutes…"
            disabled={disabled}
          />
          <Button
            disabled={disabled || !broadcast.trim()}
            onClick={() => run(`say ${broadcast.trim()}`, 'Broadcast sent').then(() => setBroadcast(''))}
          >
            Send
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-400">World controls</h2>
        <QuickCommandRow
          label="Save the world now"
          hint="Flushes all loaded chunks to disk"
          disabled={disabled}
          options={[{ value: 'save-all', label: 'save-all' }]}
          onRun={(v) => run(v, 'World save triggered')}
        />
        {isJava && (
          <>
            <QuickCommandRow
              label="Difficulty"
              options={[
                { value: 'peaceful', label: 'Peaceful' },
                { value: 'easy', label: 'Easy' },
                { value: 'normal', label: 'Normal' },
                { value: 'hard', label: 'Hard' },
              ]}
              disabled={disabled}
              onRun={(v) => run(`difficulty ${v}`, `Difficulty set to ${v}`)}
            />
            <QuickCommandRow
              label="Default gamemode"
              hint="Applies to newly joining players"
              options={[
                { value: 'survival', label: 'Survival' },
                { value: 'creative', label: 'Creative' },
                { value: 'adventure', label: 'Adventure' },
                { value: 'spectator', label: 'Spectator' },
              ]}
              disabled={disabled}
              onRun={(v) => run(`defaultgamemode ${v}`, `Default gamemode set to ${v}`)}
            />
            <QuickCommandRow
              label="Time"
              options={[
                { value: 'day', label: 'Set day' },
                { value: 'noon', label: 'Set noon' },
                { value: 'night', label: 'Set night' },
                { value: 'midnight', label: 'Set midnight' },
              ]}
              disabled={disabled}
              onRun={(v) => run(`time set ${v}`, `Time set to ${v}`)}
            />
            <QuickCommandRow
              label="Weather"
              options={[
                { value: 'clear', label: 'Clear' },
                { value: 'rain', label: 'Rain' },
                { value: 'thunder', label: 'Thunder' },
              ]}
              disabled={disabled}
              onRun={(v) => run(`weather ${v}`, `Weather set to ${v}`)}
            />
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">Moderate a player</h2>
          <Link to="../whitelist" className="text-xs text-accent-500 hover:underline">
            Manage the allowlist →
          </Link>
        </div>
        <p className="mb-3 text-xs text-ink-500">Kick, ban, or pardon by name — they don't need to be online.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
          <Field label="Player name">
            <Input value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="Notch" disabled={disabled} />
          </Field>
          <Field label="Reason (optional)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Griefing" disabled={disabled} />
          </Field>
          <Button className="self-end" disabled={disabled} onClick={() => moderate('kick')}>
            Kick
          </Button>
          <Button className="self-end" variant="danger" disabled={disabled} onClick={() => moderate('ban')}>
            Ban
          </Button>
          <Button className="self-end" disabled={disabled} onClick={() => moderate('pardon')}>
            Pardon
          </Button>
        </div>
      </Card>
    </div>
  );
}
