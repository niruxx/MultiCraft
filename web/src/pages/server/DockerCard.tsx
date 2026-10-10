import { useEffect, useState } from 'react';
import { useServerDetail } from './ServerContext.js';
import { api, ApiError } from '../../api/client.js';
import type { DockerConfig } from '../../api/types.js';
import { Button, Card, CardTitle, ErrorText, Notice, Spinner } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { DockerEditor, cleanDockerConfig } from '../../components/DockerEditor.js';
import { useToast } from '../../components/Toast.js';

/** Container settings for a Docker instance. Admin-only to change: they decide what runs on the host. */
export function DockerCard() {
  const { server, isAdmin, running, refresh } = useServerDetail();
  const toast = useToast();
  const [config, setConfig] = useState<DockerConfig | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!server) return;
    api
      .get<{ config: DockerConfig }>(`/servers/${server.id}/docker`)
      .then((res) => {
        setConfig(res.config);
        setSaved(JSON.stringify(res.config));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load container settings'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id]);

  if (!server) return null;

  async function save() {
    if (!config) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.put<{ config: DockerConfig }>(`/servers/${server!.id}/docker`, { config: cleanDockerConfig(config) });
      setConfig(res.config);
      setSaved(JSON.stringify(res.config));
      toast.success(running ? 'Saved — restart to apply' : 'Container settings saved');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <CardTitle action={<Icon name="container" className="h-5 w-5 text-ink-400" />}>Container</CardTitle>
      <p className="mb-4 text-sm text-ink-400">
        The image, ports and environment this instance's container runs with. The instance folder is the only host folder it can see. Memory
        limit = <i>Max memory</i> above.
      </p>
      {!config ? (
        error ? <ErrorText>{error}</ErrorText> : <Spinner />
      ) : (
        <>
          {!isAdmin && (
            <div className="mb-4">
              <Notice tone="info">Only admins can change container settings.</Notice>
            </div>
          )}
          <DockerEditor value={config} onChange={setConfig} disabled={!isAdmin} />
          <ErrorText>{error}</ErrorText>
          {isAdmin && (
            <div className="mt-5 flex items-center gap-3">
              <Button variant="primary" onClick={save} disabled={busy || JSON.stringify(config) === saved}>
                {busy ? 'Saving…' : 'Save container settings'}
              </Button>
              <span className="text-xs text-ink-500">A new image tag is pulled automatically on the next start.</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
