export type Role = 'admin' | 'moderator' | 'viewer';

export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  created_at: string;
  serverAccess?: string[];
}

export type Platform = 'java' | 'bedrock';
export type Loader = 'vanilla' | 'paper' | 'purpur' | 'spigot' | 'bedrock';

export const PLUGIN_CAPABLE_LOADERS: Loader[] = ['paper', 'purpur', 'spigot'];

export type ServerStatus =
  | 'installing'
  | 'install_failed'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'updating';

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
}

export interface RuntimeInfo {
  pid: number | null;
  uptimeMs: number;
  stats: { memoryMb: number | null; cpuPercent: number | null };
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
  sizeBytes: number;
  modifiedAt: string;
}

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
