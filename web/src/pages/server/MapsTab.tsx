import { useCallback, useEffect, useState } from 'react';
import { useServerDetail } from './ServerContext.js';
import { api, ApiError, downloadUrl } from '../../api/client.js';
import type { MapState } from '../../api/types.js';
import { useToast } from '../../components/Toast.js';
import { Button, Card, Spinner } from '../../components/ui.js';

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MapsTab() {
  const { serverId, canWrite } = useServerDetail();
  const toast = useToast();
  const [state, setState] = useState<MapState | null>(null);
  const [rendering, setRendering] = useState(false);
  const [imageKey, setImageKey] = useState(0); // bump to force <img> reload after re-rendering

  const load = useCallback(async () => {
    try {
      const res = await api.get<MapState>(`/servers/${serverId}/map`);
      setState(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load map status');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setRendering(true);
    try {
      const res = await api.post<{ meta: MapState['meta'] }>(`/servers/${serverId}/map/render`);
      setState((prev) => (prev ? { ...prev, meta: res.meta } : prev));
      setImageKey((k) => k + 1);
      toast.success('Map rendered');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to render map');
    } finally {
      setRendering(false);
    }
  }

  if (state === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-500">
        <Spinner /> Loading…
      </div>
    );
  }

  if (!state.capable) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-3 text-3xl">🗺️</div>
        <p className="mb-1 font-semibold text-ink-200">Bedrock world maps aren't supported yet</p>
        <p className="mx-auto max-w-md text-sm text-ink-500">
          Bedrock stores worlds in a LevelDB database with a custom compression format that doesn't have a
          lightweight reader available yet. 2D maps currently work for Java servers (Vanilla, Paper, Purpur, and
          Spigot) — Bedrock support is planned as a follow-up.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-400">
            A top-down render of the explored world, colored by each column's surface block — like a vanilla map,
            generated on demand.
          </p>
          {state.meta && (
            <p className="mt-1 text-xs text-ink-500">
              Generated {timeAgo(state.meta.generatedAt)} · {state.meta.widthPx}×{state.meta.heightPx}px ·{' '}
              {state.meta.blocksPerPixel > 1 ? `${state.meta.blocksPerPixel} blocks/px · ` : ''}
              {state.meta.chunksRendered} chunk{state.meta.chunksRendered === 1 ? '' : 's'} across{' '}
              {state.meta.regionsScanned} region{state.meta.regionsScanned === 1 ? '' : 's'}
            </p>
          )}
        </div>
        {canWrite && (
          <Button variant="primary" disabled={rendering} onClick={generate}>
            {rendering ? 'Rendering…' : state.meta ? 'Regenerate map' : 'Generate map'}
          </Button>
        )}
      </div>

      {rendering && (
        <Card className="flex items-center gap-3 p-4">
          <Spinner className="h-5 w-5 text-accent-400" />
          <div>
            <p className="text-sm font-semibold text-ink-100">Rendering…</p>
            <p className="text-xs text-ink-500">
              Reading region files and coloring each column — watch the Console tab for progress on larger worlds.
            </p>
          </div>
        </Card>
      )}

      {state.meta ? (
        <Card className="overflow-hidden p-0">
          <div className="max-h-[70vh] overflow-auto bg-surface-950 p-4">
            <img
              key={imageKey}
              src={downloadUrl(`/servers/${serverId}/map/image`)}
              alt="World map"
              className="mx-auto"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <div className="flex justify-end border-t border-surface-700/80 px-3 py-2">
            <a
              href={downloadUrl(`/servers/${serverId}/map/image`)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent-500 hover:underline"
            >
              Open full size in a new tab →
            </a>
          </div>
        </Card>
      ) : (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 text-3xl">🗺️</div>
          <p className="mb-1 font-semibold text-ink-200">No map yet</p>
          <p className="mb-4 text-sm text-ink-500">
            Start the server at least once so it generates spawn chunks, then generate a map from whatever's been
            explored so far.
          </p>
          {canWrite && (
            <Button variant="primary" disabled={rendering} onClick={generate}>
              {rendering ? 'Rendering…' : 'Generate map'}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
