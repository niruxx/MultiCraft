import type { ServerRecord } from '../types/index.js';

export type StopStrategy =
  | { kind: 'stdin'; commands: string[]; delayMs: number }
  | { kind: 'signal'; signal: 'SIGINT' | 'SIGTERM' }
  | { kind: 'none' };

export interface SteamGamePreset {
  id: string;
  label: string;
  appId: string;
  defaultPort: number;
  portProtocol: 'tcp' | 'udp';
  executable: { win32: string; linux: string };
  buildLaunchArgs(server: ServerRecord): string[];
  readyRegex?: RegExp;
  stopStrategy: StopStrategy;
  needsExecuteBit: boolean;
  notes?: string;
}

function extraArgs(server: ServerRecord): string[] {
  return server.extra_args ? server.extra_args.split(' ').filter(Boolean) : [];
}

export const STEAM_GAME_PRESETS: SteamGamePreset[] = [
  {
    id: 'palworld',
    label: 'Palworld',
    appId: '2394010',
    defaultPort: 8211,
    portProtocol: 'udp',
    executable: { win32: 'PalServer.exe', linux: 'PalServer.sh' },
    buildLaunchArgs: (server) => [
      `-port=${server.server_port}`,
      '-useperfthreads',
      '-NoAsyncLoadingThread',
      '-UseMultithreadForDS',
      ...extraArgs(server),
    ],
    stopStrategy: { kind: 'signal', signal: 'SIGTERM' },
    needsExecuteBit: true,
    notes:
      "Palworld's dedicated server does not reliably shut down cleanly on a stop signal — MultiCraft will " +
      'force-stop it after a short grace period if it does not exit on its own. Its own periodic autosave is ' +
      'what gets preserved, not a save-on-exit. Use in-game admin commands or an RCON tool if you need a ' +
      'guaranteed save immediately before stopping.',
  },
  {
    id: 'project_zomboid',
    label: 'Project Zomboid',
    appId: '380870',
    defaultPort: 16261,
    portProtocol: 'udp',
    executable: { win32: 'StartServer64.bat', linux: 'start-server.sh' },
    buildLaunchArgs: (server) => extraArgs(server),
    readyRegex: /SERVER STARTED/i,
    stopStrategy: { kind: 'stdin', commands: ['save', 'quit'], delayMs: 5000 },
    needsExecuteBit: true,
  },
  {
    id: 'valheim',
    label: 'Valheim',
    appId: '896660',
    defaultPort: 2456,
    portProtocol: 'udp',
    executable: { win32: 'valheim_server.exe', linux: 'valheim_server.x86_64' },
    buildLaunchArgs: (server) => [
      '-name', server.name,
      '-port', String(server.server_port),
      '-world', server.name,
      ...extraArgs(server),
    ],
    readyRegex: /Game server connected/i,
    // Valheim only saves the world on SIGINT, not SIGTERM — a well-documented gotcha in every
    // Valheim server wrapper.
    stopStrategy: { kind: 'signal', signal: 'SIGINT' },
    needsExecuteBit: true,
  },
  {
    id: 'terraria',
    label: 'Terraria',
    appId: '105600',
    defaultPort: 7777,
    portProtocol: 'tcp',
    executable: { win32: 'TerrariaServer.exe', linux: 'TerrariaServer.bin.x86_64' },
    buildLaunchArgs: (server) => [
      '-port', String(server.server_port),
      '-autocreate', '2',
      '-worldname', server.name,
      '-world', `worlds/${server.name}.wld`,
      ...extraArgs(server),
    ],
    readyRegex: /Server started/i,
    stopStrategy: { kind: 'stdin', commands: ['save', 'exit'], delayMs: 5000 },
    needsExecuteBit: true,
    notes:
      'Downloaded directly from terraria.org (not via steamcmd — Terraria has no separate free dedicated-server ' +
      'app, and anonymous steamcmd login cannot download the paid client depot). On Windows hosts, the server ' +
      'also needs the Microsoft XNA Framework 4.0 Redistributable installed separately — it is not bundled and ' +
      'the server will fail to start without it. Linux hosts need no extra runtime.',
  },
];

export function findPreset(appId: string | null | undefined): SteamGamePreset | undefined {
  if (!appId) return undefined;
  return STEAM_GAME_PRESETS.find((p) => p.appId === appId);
}
