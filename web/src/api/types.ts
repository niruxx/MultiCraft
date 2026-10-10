export type Role = 'admin' | 'moderator' | 'viewer';

export type ServerPermission =
  | 'power'
  | 'console'
  | 'files.read'
  | 'files.write'
  | 'backups.create'
  | 'backups.restore'
  | 'plugins'
  | 'players'
  | 'settings'
  | 'update';

export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  created_at: string;
  serverAccess?: string[];
  /** serverId → explicit permission set, or null for the role's defaults */
  serverPermissions?: Record<string, ServerPermission[] | null>;
}

export type Platform = 'java' | 'bedrock' | 'steam';
export type Loader = 'vanilla' | 'paper' | 'purpur' | 'spigot' | 'bedrock' | 'steam';

export const PLUGIN_CAPABLE_LOADERS: Loader[] = ['paper', 'purpur', 'spigot'];

/** Steam-platform servers have no Minecraft-specific players/operator/whitelist/map concept. */
export function isSteamPlatform(platform: Platform): boolean {
  return platform === 'steam';
}

export interface SteamGameOption {
  id: string;
  label: string;
  appId: string;
  defaultPort: number;
  portProtocol: 'tcp' | 'udp';
  notes: string | null;
}

export type ServerStatus =
  | 'installing'
  | 'install_failed'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'updating'
  | 'transferring';

export interface ServerRecord {
  id: string;
  name: string;
  platform: Platform;
  loader: Loader;
  version: string;
  build: string | null;
  jar_file: string | null;
  min_memory_mb: number;
  max_memory_mb: number;
  server_port: number;
  extra_java_args: string;
  extra_args: string;
  auto_start: 0 | 1;
  status: ServerStatus;
  created_at: string;
  created_by: string | null;
  steam_app_id: string | null;
  steam_login: string;
  steam_extra_flags: string;
  suspended: 0 | 1;
  suspended_reason: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
}

export interface SystemSettings {
  steamcmdSource: string | null;
}

export interface ProcessStats {
  memoryMb: number | null;
  cpuPercent: number | null;
  diskReadBytes: number | null;
  diskWriteBytes: number | null;
  diskReadRate: number | null;
  diskWriteRate: number | null;
  /** Host-wide (all interfaces) — the kernel doesn't track network bytes per process. */
  netRxBytes: number | null;
  netTxBytes: number | null;
  netRxRate: number | null;
  netTxRate: number | null;
}

export interface RuntimeInfo {
  pid: number | null;
  uptimeMs: number;
  stats: ProcessStats;
}

export interface HostAddress {
  address: string;
  interface: string;
  family: 'IPv4' | 'IPv6';
}

export interface EndpointInfo {
  host: string;
  bindAddress: string;
  port: number;
  protocol: 'tcp' | 'udp';
  hostname: string;
  addresses: HostAddress[];
}

export interface PlayerInfo {
  name: string;
  online: boolean;
  op: boolean;
  whitelisted: boolean;
  banned: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export interface BackupInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface SnapshotEntry {
  path: string;
  size: number;
}

export interface SnapshotFileSide {
  exists: boolean;
  size: number;
  binary: boolean;
  text: string | null;
}

export interface BackupSchedule {
  server_id: string;
  cron_expression: string;
  retention_count: number;
  enabled: 0 | 1;
}

export interface VersionOption {
  version: string;
  build?: string;
  recommended?: boolean;
}

export interface PropertyEntry {
  key: string;
  value: string;
}

export interface SystemInfo {
  platform: string;
  platformLabel: string;
  arch: string;
  hostname: string;
  nodeVersion: string;
  java: { available: boolean; version: string | null };
  primaryAddress: string | null;
  addresses: HostAddress[];
  cpuCores: number;
  totalMemMb: number;
  uptimeSec: number;
}

export interface NodeInfo {
  hostname: string;
  platform: string;
  arch: string;
  instances: number;
  running: number;
}

export interface PanelNode {
  id: string;
  name: string;
  url: string;
  created_at: string;
  keyHint: string;
}

export interface TransferState {
  state: 'running' | 'done' | 'failed';
  nodeId: string;
  nodeName: string;
  bytesSent: number;
  startedAt: string;
  finishedAt: string | null;
  remoteServerId: string | null;
  sourceDeleted: boolean;
  error: string | null;
}

export interface WhitelistState {
  enabled: boolean;
  players: string[];
  running: boolean;
}

export interface InstalledPlugin {
  fileName: string;
  displayName: string;
  enabled: boolean;
  canToggle: boolean;
  sizeBytes: number;
  modifiedAt: string;
  detail: string | null;
}

export type AddonCatalog = 'plugin' | 'datapack';

export interface AddonProfile {
  kind: 'bukkit' | 'datapack' | 'bedrock' | 'bepinex' | 'pak';
  label: string;
  singular: string;
  folder: string;
  extensions: string[];
  catalog: AddonCatalog | null;
  notes: string[];
  warning: string | null;
}

export type AddonSupport = { supported: true; profile: AddonProfile } | { supported: false; reason: string };

export interface PluginSearchResult {
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  author: string;
  categories: string[];
}

export interface ResolvedPluginVersion {
  versionNumber: string;
  fileName: string;
  downloadUrl: string;
  sizeBytes: number;
  versionMismatchWarning: boolean;
}

export interface ResourcesInfo {
  runtime: RuntimeInfo | null;
  running: boolean;
  disk: { serverBytes: number; backupsBytes: number };
  host: { totalMemMb: number; freeMemMb: number; cpuCores: number; loadAvg: number | null };
}

export interface UpdateCheckResult {
  currentVersion: string;
  currentBuild: string | null;
  latestVersion: string | null;
  latestBuild: string | null;
  updateAvailable: boolean;
  note?: string;
}

export interface MapMeta {
  generatedAt: string;
  widthPx: number;
  heightPx: number;
  blocksPerPixel: number;
  minBlockX: number;
  minBlockZ: number;
  chunksRendered: number;
  regionsScanned: number;
}

export interface MapState {
  capable: boolean;
  meta: MapMeta | null;
}
