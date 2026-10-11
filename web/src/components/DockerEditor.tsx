import { AnimatePresence, motion } from 'framer-motion';
import type { DockerConfig, PortMapping } from '../api/types.js';
import { Field, Input, Select } from './ui.js';
import { Icon } from './icons.js';
import { EMPHASIZED } from './motion.js';

function Rows<T>({ items, render, keyOf }: { items: T[]; render: (item: T, i: number) => React.ReactNode; keyOf: (item: T, i: number) => string | number }) {
  return (
    <AnimatePresence initial={false}>
      {items.map((item, i) => (
        <motion.div
          key={keyOf(item, i)}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: EMPHASIZED }}
          className="overflow-hidden"
        >
          <div className="mb-2 flex items-center gap-2">{render(item, i)}</div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

const removeBtn = (onClick: () => void, label: string) => (
  <button type="button" aria-label={label} onClick={onClick} className="state-layer rounded-full p-2 text-ink-400">
    <Icon name="close" className="h-4 w-4" />
  </button>
);

/** Edits a container definition: image, ports, environment, mount path and limits. */
export function DockerEditor({
  value,
  onChange,
  disabled = false,
  lockImage = false,
  allowEngineSocket = true,
}: {
  value: DockerConfig;
  onChange: (v: DockerConfig) => void;
  disabled?: boolean;
  /** Catalog-only accounts keep the template's image. */
  lockImage?: boolean;
  /** Hide the engine-socket option for accounts without Portainer access. */
  allowEngineSocket?: boolean;
}) {
  const set = (patch: Partial<DockerConfig>) => onChange({ ...value, ...patch });
  const setPort = (i: number, patch: Partial<PortMapping>) => set({ ports: value.ports.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Image">
          <Input
            value={value.image}
            onChange={(e) => set({ image: e.target.value.trim() })}
            placeholder="e.g. itzg/minecraft-server:latest"
            className="font-mono"
            disabled={lockImage}
            title={lockImage ? 'Your account runs catalog images only' : undefined}
          />
        </Field>
        <Field label="Instance folder mounted at">
          <Input value={value.dataPath} onChange={(e) => set({ dataPath: e.target.value })} placeholder="/data" className="font-mono" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-300">Ports (host → container)</span>
          <button
            type="button"
            className="state-layer inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-accent-400"
            onClick={() => set({ ports: [...value.ports, { host: (value.ports.at(-1)?.host ?? 27014) + 1, container: (value.ports.at(-1)?.container ?? 27014) + 1, protocol: value.ports.at(-1)?.protocol ?? 'tcp' }] })}
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Add port
          </button>
        </div>
        <Rows
          items={value.ports}
          keyOf={(_, i) => i}
          render={(p, i) => (
            <>
              <Input type="number" min={1} max={65535} value={p.host || ''} onChange={(e) => setPort(i, { host: Number(e.target.value) })} className="!w-28" aria-label="Host port" />
              <Icon name="back" className="h-4 w-4 rotate-180 text-ink-500" />
              <Input type="number" min={1} max={65535} value={p.container || ''} onChange={(e) => setPort(i, { container: Number(e.target.value) })} className="!w-28" aria-label="Container port" />
              <Select value={p.protocol} onChange={(e) => setPort(i, { protocol: e.target.value as 'tcp' | 'udp' })} className="!w-24">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </Select>
              {value.ports.length > 1 && removeBtn(() => set({ ports: value.ports.filter((_, j) => j !== i) }), 'Remove port')}
            </>
          )}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-300">Environment variables</span>
          <button
            type="button"
            className="state-layer inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-accent-400"
            onClick={() => set({ env: [...value.env, { key: '', value: '' }] })}
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Add variable
          </button>
        </div>
        <Rows
          items={value.env}
          keyOf={(_, i) => i}
          render={(e, i) => (
            <>
              <Input
                value={e.key}
                onChange={(ev) => set({ env: value.env.map((x, j) => (j === i ? { ...x, key: ev.target.value.replace(/[^A-Za-z0-9_]/g, '_') } : x)) })}
                placeholder="NAME"
                className="!w-44 font-mono"
              />
              <span className="text-ink-500">=</span>
              <Input value={e.value} onChange={(ev) => set({ env: value.env.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) })} placeholder="value" className="font-mono" />
              {removeBtn(() => set({ env: value.env.filter((_, j) => j !== i) }), 'Remove variable')}
            </>
          )}
        />
        {value.env.length === 0 && <p className="text-xs text-ink-500">None.</p>}
        <p className="text-xs text-ink-500">
          Values can use <span className="font-mono">{'{{PORT}} {{NAME}} {{MIN_MEMORY}} {{MAX_MEMORY}}'}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CPU limit (cores, empty = unlimited)">
          <Input type="number" min={0.25} step={0.25} value={value.cpus ?? ''} onChange={(e) => set({ cpus: e.target.value ? Number(e.target.value) : null })} placeholder="unlimited" />
        </Field>
        <Field label="Command override (optional)">
          <Input value={value.command} onChange={(e) => set({ command: e.target.value })} placeholder="the image's default" className="font-mono" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-300">Extra folders (instance subfolder → container path)</span>
          <button
            type="button"
            className="state-layer inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-accent-400"
            onClick={() => set({ volumes: [...(value.volumes ?? []), { subdir: '', containerPath: '' }] })}
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Add folder
          </button>
        </div>
        <Rows
          items={value.volumes ?? []}
          keyOf={(_, i) => i}
          render={(v, i) => (
            <>
              <Input
                value={v.subdir}
                onChange={(e) => set({ volumes: value.volumes.map((x, j) => (j === i ? { ...x, subdir: e.target.value } : x)) })}
                placeholder="media"
                className="font-mono"
                aria-label="Instance subfolder"
              />
              <Icon name="back" className="h-4 w-4 shrink-0 rotate-180 text-ink-500" />
              <Input
                value={v.containerPath}
                onChange={(e) => set({ volumes: value.volumes.map((x, j) => (j === i ? { ...x, containerPath: e.target.value } : x)) })}
                placeholder="/media"
                className="font-mono"
                aria-label="Container path"
              />
              {removeBtn(() => set({ volumes: value.volumes.filter((_, j) => j !== i) }), 'Remove folder')}
            </>
          )}
        />
        {(value.volumes ?? []).length === 0 && <p className="text-xs text-ink-500">Only the instance folder is mounted.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Web interface">
          <Select
            value={value.webUi ? String(value.webUi.port) : ''}
            onChange={(e) =>
              set({ webUi: e.target.value ? { port: Number(e.target.value), scheme: value.webUi?.scheme ?? 'http', path: value.webUi?.path ?? '/' } : null })
            }
          >
            <option value="">None</option>
            {[...new Set(value.ports.filter((p) => p.protocol === 'tcp').map((p) => p.host))].map((port) => (
              <option key={port} value={port}>
                Port {port}
              </option>
            ))}
          </Select>
        </Field>
        {value.webUi && (
          <>
            <Field label="Scheme">
              <Select value={value.webUi.scheme} onChange={(e) => set({ webUi: { ...value.webUi!, scheme: e.target.value as 'http' | 'https' } })}>
                <option value="http">http</option>
                <option value="https">https</option>
              </Select>
            </Field>
            <Field label="Path">
              <Input value={value.webUi.path} onChange={(e) => set({ webUi: { ...value.webUi!, path: e.target.value || '/' } })} className="font-mono" />
            </Field>
          </>
        )}
      </div>

      {(allowEngineSocket || value.mountEngineSocket) && (
      <label className={`flex items-start gap-3 rounded-2xl p-3 text-sm ${value.mountEngineSocket ? 'bg-error-container text-error-on-container' : 'bg-surface-900 text-ink-200'}`}>
        <input type="checkbox" className="mt-1" checked={value.mountEngineSocket} onChange={(e) => set({ mountEngineSocket: e.target.checked })} disabled={!allowEngineSocket} />
        <span>
          <span className="font-medium">Give it control of the container engine</span>
          <span className="block text-xs opacity-80">
            Mounts the Docker/Podman API socket at <span className="font-mono">/var/run/docker.sock</span> — for container managers like Portainer.
            The container can then start, stop and inspect every container on this host. Only enable it for software you trust.
          </span>
        </span>
      </label>
      )}

      <label className="flex items-start gap-3 rounded-2xl bg-surface-900 p-3 text-sm text-ink-200">
        <input type="checkbox" className="mt-1" checked={value.runAsPanelUser} onChange={(e) => set({ runAsPanelUser: e.target.checked })} />
        <span>
          <span className="font-medium">Run as the panel’s user</span>
          <span className="block text-xs text-ink-400">
            Keeps files the container writes editable from File Management. Turn off for images that must start as root (most SteamCMD-based
            ones handle their own user via PUID/PGID).
          </span>
        </span>
      </label>
    </fieldset>
  );
}

export function cleanDockerConfig(c: DockerConfig): DockerConfig {
  return {
    ...c,
    image: c.image.trim(),
    env: c.env.filter((e) => e.key.trim()),
    command: c.command.trim(),
    dataPath: c.dataPath.trim() || '/data',
    volumes: (c.volumes ?? []).filter((v) => v.subdir.trim() && v.containerPath.trim()).map((v) => ({ subdir: v.subdir.trim(), containerPath: v.containerPath.trim() })),
    webUi: c.webUi && c.ports.some((p) => p.host === c.webUi!.port && p.protocol === 'tcp') ? c.webUi : null,
  };
}
