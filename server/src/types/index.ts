export type Role = 'admin' | 'moderator' | 'viewer';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  role: Role;
  created_at: string;
}

export type PublicUser = Omit<User, 'password_hash' | 'password_salt'>;

export type Platform = 'java' | 'bedrock' | 'steam';
export type Loader = 'vanilla' | 'paper' | 'purpur' | 'spigot' | 'bedrock' | 'steam';

/** Loaders that support the Bukkit plugin API (a /plugins directory of jars). */
export const PLUGIN_CAPABLE_LOADERS: Loader[] = ['paper', 'purpur', 'spigot'];

/** Steam-platform servers (Palworld, Valheim, etc.) have no Minecraft-specific concept of
 *  players/operators/whitelist/world maps — those tabs and routes are hidden/rejected for them. */
export function isSteamPlatform(platform: Platform): boolean {
  return platform === 'steam';
}

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
  steam_app_id: string | null;
  steam_login: string;
  steam_extra_flags: string;
}

export interface BackupSchedule {
  server_id: string;
  cron_expression: string;
  retention_count: number;
  enabled: 0 | 1;
}

export interface AuthTokenPayload {
  sub: string; // user id
  username: string;
  role: Role;
  iat: number;
  exp: number;
}

export interface PlayerInfo {
  name: string;
  online: boolean;
  op: boolean;
  whitelisted: boolean;
  banned: boolean;
}
