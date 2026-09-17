import fs from 'node:fs';
import path from 'node:path';
import { pluginsDir, safeJoin } from '../utils/paths.js';
import { downloadFile, type LogFn } from '../utils/download.js';
import { HttpError } from '../utils/asyncHandler.js';
import type { Loader } from '../types/index.js';
import { PLUGIN_CAPABLE_LOADERS } from '../types/index.js';

export function isPluginCapable(loader: Loader): boolean {
  return PLUGIN_CAPABLE_LOADERS.includes(loader);
}

const DISABLED_SUFFIX = '.disabled';

export interface InstalledPlugin {
  fileName: string; // on-disk name, e.g. "LuckPerms-Bukkit-5.5.71.jar" or "...jar.disabled"
  displayName: string; // fileName with the .disabled marker stripped
  enabled: boolean;
  sizeBytes: number;
  modifiedAt: string;
}

function resolvePluginPath(serverId: string, fileName: string): string {
  try {
    return safeJoin(pluginsDir(serverId), fileName);
  } catch {
    throw new HttpError(400, 'Invalid plugin file name');
  }
}

export function listPlugins(serverId: string): InstalledPlugin[] {
  const dir = pluginsDir(serverId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && (e.name.endsWith('.jar') || e.name.endsWith('.jar' + DISABLED_SUFFIX)))
    .map((e) => {
      const full = path.join(dir, e.name);
      const stat = fs.statSync(full);
      const enabled = !e.name.endsWith(DISABLED_SUFFIX);
      return {
        fileName: e.name,
        displayName: enabled ? e.name : e.name.slice(0, -DISABLED_SUFFIX.length),
        enabled,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function setPluginEnabled(serverId: string, fileName: string, enable: boolean): void {
  const current = resolvePluginPath(serverId, fileName);
  if (!fs.existsSync(current)) throw new HttpError(404, 'Plugin not found');
  const isDisabled = fileName.endsWith(DISABLED_SUFFIX);
  if (enable === !isDisabled) return; // already in the requested state
  const target = enable ? current.slice(0, -DISABLED_SUFFIX.length) : current + DISABLED_SUFFIX;
  fs.renameSync(current, target);
}

export function deletePlugin(serverId: string, fileName: string): void {
  const target = resolvePluginPath(serverId, fileName);
  fs.rmSync(target, { force: true });
}

/** Downloads a resolved plugin jar directly into the server's /plugins directory. */
export async function installPluginFile(
  serverId: string,
  downloadUrl: string,
  fileName: string,
  onLog?: LogFn
): Promise<void> {
  const dir = pluginsDir(serverId);
  fs.mkdirSync(dir, { recursive: true });
  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = safeJoin(dir, safeName);
  await downloadFile(downloadUrl, destination, undefined, onLog);
}
