import { useCallback, useEffect, useState } from 'react';
import { useServerDetail } from './ServerContext.js';
import { api, ApiError, downloadUrl } from '../../api/client.js';
import type { BackupInfo, BackupSchedule } from '../../api/types.js';
import { Button, Card, ErrorText, Field, Input } from '../../components/ui.js';
import { useToast } from '../../components/Toast.js';
import { useConfirm } from '../../components/ConfirmDialog.js';

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const PRESETS = [
  { label: 'Daily at 3 AM', cron: '0 3 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Weekly (Sun 3 AM)', cron: '0 3 * * 0' },
];

export function BackupsTab() {
  const { serverId, canWrite } = useServerDetail();
  const toast = useToast();
  const confirm = useConfirm();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [cronExpression, setCronExpression] = useState('0 3 * * *');
  const [retentionCount, setRetentionCount] = useState(5);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const load = useCallback(async () => {
    try {
      const [backupsRes, scheduleRes] = await Promise.all([
        api.get<{ backups: BackupInfo[] }>(`/servers/${serverId}/backups`),
        api.get<{ schedule: BackupSchedule | null }>(`/servers/${serverId}/backups/schedule`),
      ]);
      setBackups(backupsRes.backups);
      setSchedule(scheduleRes.schedule);
      if (scheduleRes.schedule) {
        setCronExpression(scheduleRes.schedule.cron_expression);
        setRetentionCount(scheduleRes.schedule.retention_count);
        setScheduleEnabled(!!scheduleRes.schedule.enabled);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load backups');
    }
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createBackup() {
    setCreating(true);
    setError('');
    try {
      await api.post(`/servers/${serverId}/backups`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  }

  async function restoreBackup(fileName: string) {
    const ok = await confirm({
      title: 'Restore backup',
      message: `Restore "${fileName}"? This replaces all current server files. The server must be stopped.`,
      confirmLabel: 'Restore',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyFile(fileName);
    setError('');
    try {
      await api.post(`/servers/${serverId}/backups/${encodeURIComponent(fileName)}/restore`);
      toast.success('Backup restored');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to restore backup');
    } finally {
      setBusyFile(null);
    }
  }

  async function deleteBackup(fileName: string) {
    const ok = await confirm({
      title: 'Delete backup',
      message: `Delete backup "${fileName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyFile(fileName);
    try {
      await api.delete(`/servers/${serverId}/backups/${encodeURIComponent(fileName)}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete backup');
    } finally {
      setBusyFile(null);
    }
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    setError('');
    try {
      const res = await api.put<{ schedule: BackupSchedule }>(`/servers/${serverId}/backups/schedule`, {
        cronExpression,
        retentionCount,
        enabled: scheduleEnabled,
      });
      setSchedule(res.schedule);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function removeSchedule() {
    const ok = await confirm({
      title: 'Turn off automated backups',
      message: 'Turn off automated backups for this server?',
      confirmLabel: 'Turn off',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/servers/${serverId}/backups/schedule`);
      setSchedule(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove schedule');
    }
  }

  return (
    <div className="space-y-6">
      <ErrorText>{error}</ErrorText>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Backups</h2>
          {canWrite && (
            <Button variant="primary" onClick={createBackup} disabled={creating}>
              {creating ? 'Creating…' : 'Create backup now'}
            </Button>
          )}
        </div>
        {backups === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-slate-500">No backups yet.</p>
        ) : (
          <div className="divide-y divide-surface-800">
            {backups.map((b, i) => (
              <div
                key={b.fileName}
                style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}
                className="animate-fade-in-up flex flex-wrap items-center gap-3 py-2"
              >
                <span className="flex-1 truncate font-mono text-sm text-slate-200">{b.fileName}</span>
                <span className="text-xs text-slate-500">{formatSize(b.sizeBytes)}</span>
                <span className="text-xs text-slate-500">{new Date(b.createdAt).toLocaleString()}</span>
                <div className="flex gap-1.5">
                  <a
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-surface-700 hover:text-slate-200"
                    href={downloadUrl(`/servers/${serverId}/backups/${encodeURIComponent(b.fileName)}/download`)}
                  >
                    Download
                  </a>
                  {canWrite && (
                    <>
                      <button
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-surface-700 hover:text-slate-200"
                        disabled={busyFile === b.fileName}
                        onClick={() => restoreBackup(b.fileName)}
                      >
                        Restore
                      </button>
                      <button
                        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                        disabled={busyFile === b.fileName}
                        onClick={() => deleteBackup(b.fileName)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Automated backups</h2>
        {schedule && (
          <p className="mb-3 text-sm text-slate-400">
            Current schedule: <span className="font-mono text-slate-200">{schedule.cron_expression}</span>, keeping the last{' '}
            {schedule.retention_count} backup(s), {schedule.enabled ? 'enabled' : 'disabled'}.
          </p>
        )}
        {canWrite && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.cron}
                  className="rounded-full border border-surface-600 px-3 py-1 text-xs text-slate-300 hover:border-accent-600 hover:text-accent-500"
                  onClick={() => setCronExpression(p.cron)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Cron expression">
                <Input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Keep last N backups">
                <Input type="number" min={1} value={retentionCount} onChange={(e) => setRetentionCount(Number(e.target.value))} />
              </Field>
              <Field label="Enabled">
                <label className="flex h-9 items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
                  Run automatically
                </label>
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={saveSchedule} disabled={savingSchedule}>
                {savingSchedule ? 'Saving…' : 'Save schedule'}
              </Button>
              {schedule && (
                <Button variant="ghost" onClick={removeSchedule}>
                  Turn off
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
