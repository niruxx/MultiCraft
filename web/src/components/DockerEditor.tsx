import { AnimatePresence, motion } from 'framer-motion';
import type { DockerConfig, PortMapping } from '../api/types.js';
import { Field, Input, Select } from './ui.js';
import { Icon } from './icons.js';
import { EMPHASIZED } from './motion.js';

export interface DockerPreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  config: DockerConfig;
  /** Suggested memory limit (MB) for the container. */
  memoryMb: number;
}

/** Popular community images. Users can change anything afterwards. */
export const DOCKER_PRESETS: DockerPreset[] = [
  {
    id: 'mc-java',
    label: 'Minecraft: Java',
    emoji: '⛏️',
    description: 'itzg/minecraft-server — Paper, Vanilla, Fabric, Forge… chosen with TYPE.',
    memoryMb: 3072,
    config: {
      image: 'itzg/minecraft-server',
      ports: [{ host: 25565, container: 25565, protocol: 'tcp' }],
      env: [
        { key: 'EULA', value: 'TRUE' },
        { key: 'TYPE', value: 'PAPER' },
        { key: 'VERSION', value: 'LATEST' },
        { key: 'MEMORY', value: '{{MIN_MEMORY}}M' },
      ],
      dataPath: '/data',
      cpus: null,
      command: '',
      runAsPanelUser: true,
    },
  },
  {
    id: 'mc-bedrock',
    label: 'Minecraft: Bedrock',
    emoji: '🪨',
    description: 'itzg/minecraft-bedrock-server',
    memoryMb: 2048,
    config: {
      image: 'itzg/minecraft-bedrock-server',
      ports: [{ host: 19132, container: 19132, protocol: 'udp' }],
      env: [
        { key: 'EULA', value: 'TRUE' },
        { key: 'VERSION', value: 'LATEST' },
      ],
      dataPath: '/data',
      cpus: null,
      command: '',
      runAsPanelUser: true,
    },
  },
  {
    id: 'valheim',
    label: 'Valheim',
    emoji: '🪖',
    description: 'lloesche/valheim-server',
    memoryMb: 4096,
    config: {
      image: 'lloesche/valheim-server',
      ports: [
        { host: 2456, container: 2456, protocol: 'udp' },
        { host: 2457, container: 2457, protocol: 'udp' },
      ],
      env: [
        { key: 'SERVER_NAME', value: '{{NAME}}' },
        { key: 'WORLD_NAME', value: 'Dedicated' },
        { key: 'SERVER_PASS', value: 'change-me' },
      ],
      dataPath: '/config',
      cpus: null,
      command: '',
      runAsPanelUser: false,
    },
  },
  {
    id: 'palworld',
    label: 'Palworld',
    emoji: '🐾',
    description: 'thijsvanloef/palworld-server-docker',
    memoryMb: 16384,
    config: {
      image: 'thijsvanloef/palworld-server-docker',
      ports: [
        { host: 8211, container: 8211, protocol: 'udp' },
        { host: 27015, container: 27015, protocol: 'udp' },
      ],
      env: [
        { key: 'PORT', value: '8211' },
        { key: 'PLAYERS', value: '16' },
        { key: 'SERVER_NAME', value: '{{NAME}}' },
      ],
      dataPath: '/palworld',
      cpus: null,
      command: '',
      runAsPanelUser: false,
    },
  },
  {
    id: 'cs2',
    label: 'Counter-Strike 2',
    emoji: '🎯',
    description: 'joedwards32/cs2',
    memoryMb: 4096,
    config: {
      image: 'joedwards32/cs2',
      ports: [
        { host: 27015, container: 27015, protocol: 'tcp' },
        { host: 27015, container: 27015, protocol: 'udp' },
      ],
      env: [{ key: 'CS2_SERVERNAME', value: '{{NAME}}' }],
      dataPath: '/home/steam/cs2-dedicated',
      cpus: null,
      command: '',
      runAsPanelUser: false,
    },
  },
  {
    id: 'custom',
    label: 'Any image',
    emoji: '🐳',
    description: 'Bring your own image',
    memoryMb: 2048,
    config: {
      image: '',
      ports: [{ host: 27015, container: 27015, protocol: 'tcp' }],
      env: [],
      dataPath: '/data',
      cpus: null,
      command: '',
      runAsPanelUser: true,
    },
  },
];

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
export function DockerEditor({ value, onChange, disabled = false }: { value: DockerConfig; onChange: (v: DockerConfig) => void; disabled?: boolean }) {
  const set = (patch: Partial<DockerConfig>) => onChange({ ...value, ...patch });
  const setPort = (i: number, patch: Partial<PortMapping>) => set({ ports: value.ports.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Image">
          <Input value={value.image} onChange={(e) => set({ image: e.target.value.trim() })} placeholder="e.g. itzg/minecraft-server:latest" className="font-mono" />
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
  };
}
