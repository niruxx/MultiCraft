export type Role = 'admin' | 'moderator' | 'viewer';

export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  created_at: string;
  serverAccess?: string[];
}

export type Platform = 'java' | 'bedrock';
export type Loader = 'vanilla' | 'paper' | 'purpur' | 'bedrock';

export type ServerStatus =
  | 'installing'
  | 'install_failed'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed';

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
