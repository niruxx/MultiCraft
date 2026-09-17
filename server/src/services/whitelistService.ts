import fs from 'node:fs';
import path from 'node:path';
import { instanceDir } from '../utils/paths.js';
import { readServerProperties, writeServerProperties } from './propertiesService.js';
import { resolvePlayerUuid } from './mojangService.js';
import type { Platform } from '../types/index.js';

interface WhitelistEntry {
  uuid: string;
  name: string;
}

interface PlatformConfig {
  propertyKey: string;
  fileName: string;
  /** The console command namespace ("whitelist" on Java, "allowlist" on Bedrock). */
  command: string;
}

function configFor(platform: Platform): PlatformConfig {
  return platform === 'bedrock'
    ? { propertyKey: 'allow-list', fileName: 'allowlist.json', command: 'allowlist' }
    : { propertyKey: 'white-list', fileName: 'whitelist.json', command: 'whitelist' };
}

export function whitelistCommand(platform: Platform): string {
  return configFor(platform).command;
}

function whitelistFilePath(serverId: string, platform: Platform): string {
  return path.join(instanceDir(serverId), configFor(platform).fileName);
}

function readEntries(serverId: string, platform: Platform): WhitelistEntry[] {
  try {
    const raw = fs.readFileSync(whitelistFilePath(serverId, platform), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(serverId: string, platform: Platform, entries: WhitelistEntry[]): void {
  fs.writeFileSync(whitelistFilePath(serverId, platform), JSON.stringify(entries, null, 2));
}

function isOnlineMode(serverId: string, platform: Platform): boolean {
  if (platform === 'bedrock') return false; // Bedrock has no comparable online-mode concept here
  const props = readServerProperties(serverId, platform);
  const entry = props.find((p) => p.key === 'online-mode');
  return entry ? entry.value !== 'false' : true; // Vanilla defaults online-mode to true
}

export interface WhitelistState {
  enabled: boolean;
  players: string[];
}

export function getWhitelistState(serverId: string, platform: Platform): WhitelistState {
  const props = readServerProperties(serverId, platform);
  const enabledProp = props.find((p) => p.key === configFor(platform).propertyKey);
  return {
    enabled: enabledProp?.value === 'true',
    players: readEntries(serverId, platform)
      .map((e) => e.name)
      .filter(Boolean),
  };
}

export function setWhitelistEnabled(serverId: string, platform: Platform, enabled: boolean): void {
  writeServerProperties(serverId, platform, { [configFor(platform).propertyKey]: enabled ? 'true' : 'false' });
}

/** Adds a player directly to the whitelist/allowlist file (used while the server is stopped). */
export async function addToWhitelistFile(serverId: string, platform: Platform, name: string): Promise<void> {
  const entries = readEntries(serverId, platform);
  if (entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
  const uuid = platform === 'bedrock' ? '' : await resolvePlayerUuid(name, isOnlineMode(serverId, platform));
  entries.push({ uuid, name });
  writeEntries(serverId, platform, entries);
}

/** Removes a player directly from the whitelist/allowlist file (used while the server is stopped). */
export function removeFromWhitelistFile(serverId: string, platform: Platform, name: string): void {
  const entries = readEntries(serverId, platform);
  writeEntries(
    serverId,
    platform,
    entries.filter((e) => e.name.toLowerCase() !== name.toLowerCase())
  );
}
