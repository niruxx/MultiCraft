import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import AdmZip from 'adm-zip';
import { logger } from '../utils/logger.js';
import type { Loader, Platform } from '../types/index.js';

const MOJANG_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
const PAPER_API = 'https://fill.papermc.io/v3/projects';
const PURPUR_API = 'https://api.purpurmc.org/v2/purpur';
const BEDROCK_LINKS_API =
  'https://net-secondary.web.minecraft-services.net/api/v1.0/download/links';

export interface VersionOption {
  version: string;
  build?: string;
  recommended?: boolean;
}

/** Progress callback for the coarse install progress bar. */
export type ProgressFn = (pct: number, message: string) => void;
/** Verbose, line-by-line log callback — mirrors what `npm install --verbose` prints. */
export type LogFn = (line: string) => void;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

function describeHost(): string {
  const osName = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
  return `${osName} (${process.platform}/${process.arch})`;
}

async function fetchJson<T>(url: string, onLog?: LogFn): Promise<T> {
  onLog?.(`> GET ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'MultiCraft-Panel' } });
  if (!res.ok) throw new Error(`Request to ${url} failed with status ${res.status}`);
  return (await res.json()) as T;
}

async function downloadFile(
  url: string,
  destination: string,
  onProgress?: (pct: number) => void,
  onLog?: LogFn
) {
  onLog?.(`> GET ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'MultiCraft-Panel' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const total = Number(res.headers.get('content-length') ?? 0);
  onLog?.(
    total > 0
      ? `  content-length: ${formatBytes(total)} -> ${path.basename(destination)}`
      : `  streaming -> ${path.basename(destination)} (size unknown)`
  );

  const startedAt = Date.now();
  let received = 0;
  let lastLoggedDecile = -1;
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
  const out = fs.createWriteStream(destination);
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (total > 0) {
      const pct = Math.round((received / total) * 100);
      onProgress?.(pct);
      const decile = Math.floor(pct / 10);
      if (decile > lastLoggedDecile) {
        lastLoggedDecile = decile;
        onLog?.(`  ... ${pct}% (${formatBytes(received)} / ${formatBytes(total)})`);
      }
    }
  });
  nodeStream.pipe(out);
  await finished(out);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  onLog?.(`  done in ${seconds}s (${formatBytes(received)})`);
}

/** Lists installable versions for a given loader, newest first. */
export async function listAvailableVersions(loader: Loader): Promise<VersionOption[]> {
  if (loader === 'vanilla') {
    const manifest = await fetchJson<{
      latest: { release: string; snapshot: string };
      versions: { id: string; type: string }[];
    }>(MOJANG_MANIFEST);
    return manifest.versions
      .filter((v) => v.type === 'release')
      .map((v) => ({ version: v.id, recommended: v.id === manifest.latest.release }));
  }
  if (loader === 'paper') {
    const data = await fetchJson<{ versions: Record<string, string[]> }>(`${PAPER_API}/paper`);
    const versions = Object.values(data.versions).flat();
    return versions.map((v, i) => ({ version: v, recommended: i === versions.length - 1 })).reverse();
  }
  if (loader === 'purpur') {
    const data = await fetchJson<{ versions: string[] }>(PURPUR_API);
    return data.versions.map((v, i) => ({ version: v, recommended: i === data.versions.length - 1 })).reverse();
  }
  if (loader === 'bedrock') {
    // Bedrock dedicated server only ships the latest build; expose it as a single "latest" option.
    return [{ version: 'latest', recommended: true }];
  }
  throw new Error(`Unknown loader: ${loader}`);
}

export interface InstallResult {
  jarFile: string | null; // relative filename inside the instance dir (Java only)
  build: string | null;
  executable: string | null; // relative path to bedrock_server executable (Bedrock only)
}

/** Downloads and installs the requested server software into `instanceDir`, logging verbosely as it goes. */
export async function installServer(
  platform: Platform,
  loader: Loader,
  version: string,
  instanceDir: string,
  onProgress?: ProgressFn,
  onLog?: LogFn
): Promise<InstallResult> {
  fs.mkdirSync(instanceDir, { recursive: true });
  onLog?.(`==> Installing ${loader} ${version} (${platform}) into ${instanceDir}`);
  onLog?.(`==> Host environment detected: ${describeHost()}`);

  if (loader === 'vanilla') {
    onProgress?.(0, 'Resolving vanilla version metadata');
    onLog?.('==> Resolving Vanilla version metadata from Mojang');
    const manifest = await fetchJson<{ versions: { id: string; url: string }[] }>(MOJANG_MANIFEST, onLog);
    const entry = manifest.versions.find((v) => v.id === version);
    if (!entry) throw new Error(`Unknown vanilla version: ${version}`);
    const detail = await fetchJson<{ downloads: { server: { url: string } } }>(entry.url, onLog);
    const jarFile = 'server.jar';
    onLog?.(`==> Resolved Vanilla ${version} -> ${detail.downloads.server.url}`);
    onProgress?.(10, 'Downloading server.jar');
    onLog?.('==> Downloading server.jar');
    await downloadFile(
      detail.downloads.server.url,
      path.join(instanceDir, jarFile),
      (pct) => onProgress?.(10 + Math.round(pct * 0.85), 'Downloading server.jar'),
      onLog
    );
    onLog?.('==> Install complete');
    onProgress?.(100, 'Installed');
    return { jarFile, build: null, executable: null };
  }

  if (loader === 'paper' || loader === 'purpur') {
    if (loader === 'paper') {
      onProgress?.(0, 'Resolving Paper build');
      onLog?.(`==> Resolving Paper builds for ${version} from the PaperMC Fill API`);
      const builds = await fetchJson<
        { id: number; channel: string; downloads: Record<string, { name: string; url: string }> }[]
      >(`${PAPER_API}/paper/versions/${version}/builds`, onLog);
      if (!builds.length) throw new Error(`No Paper builds found for version ${version}`);
      const best =
        builds.find((b) => b.channel === 'STABLE' || b.channel === 'DEFAULT') ?? builds[0];
      const download = best.downloads['server:default'] ?? Object.values(best.downloads)[0];
      const jarFile = download.name;
      onLog?.(`==> Selected build #${best.id} (${best.channel}) -> ${jarFile}`);
      onProgress?.(10, `Downloading ${jarFile}`);
      onLog?.(`==> Downloading ${jarFile}`);
      await downloadFile(
        download.url,
        path.join(instanceDir, jarFile),
        (pct) => onProgress?.(10 + Math.round(pct * 0.85), `Downloading ${jarFile}`),
        onLog
      );
      onLog?.('==> Install complete');
      onProgress?.(100, 'Installed');
      return { jarFile, build: String(best.id), executable: null };
    } else {
      onProgress?.(0, 'Resolving Purpur build');
      onLog?.(`==> Resolving latest Purpur build for ${version} from the PurpurMC API`);
      const info = await fetchJson<{ builds: { latest: string } }>(`${PURPUR_API}/${version}`, onLog);
      const build = info.builds.latest;
      const jarFile = `purpur-${version}-${build}.jar`;
      const url = `${PURPUR_API}/${version}/${build}/download`;
      onLog?.(`==> Selected build #${build} -> ${jarFile}`);
      onProgress?.(10, `Downloading ${jarFile}`);
      onLog?.(`==> Downloading ${jarFile}`);
      await downloadFile(
        url,
        path.join(instanceDir, jarFile),
        (pct) => onProgress?.(10 + Math.round(pct * 0.85), `Downloading ${jarFile}`),
        onLog
      );
      onLog?.('==> Install complete');
      onProgress?.(100, 'Installed');
      return { jarFile, build, executable: null };
    }
  }

  if (loader === 'bedrock') {
    onProgress?.(0, 'Resolving Bedrock dedicated server download');
    onLog?.('==> Fetching current Bedrock Dedicated Server download links from Mojang');
    const data = await fetchJson<{ result: { links: { downloadType: string; downloadUrl: string }[] } }>(
      BEDROCK_LINKS_API,
      onLog
    );
    const isWindows = process.platform === 'win32';
    const platformKey = isWindows ? 'serverBedrockWindows' : 'serverBedrockLinux';
    onLog?.(
      `==> Host OS is ${describeHost()} -> selecting the ${isWindows ? 'Windows' : 'Linux'} Bedrock build (${platformKey})`
    );
    const link = data.result.links.find((l) => l.downloadType === platformKey);
    if (!link) throw new Error('Could not resolve Bedrock server download link');
    onLog?.(`==> Resolved download: ${link.downloadUrl}`);
    const zipPath = path.join(instanceDir, '_bds_download.zip');
    onProgress?.(10, 'Downloading Bedrock dedicated server');
    onLog?.('==> Downloading Bedrock Dedicated Server archive');
    await downloadFile(
      link.downloadUrl,
      zipPath,
      (pct) => onProgress?.(10 + Math.round(pct * 0.7), 'Downloading Bedrock dedicated server'),
      onLog
    );
    onProgress?.(85, 'Extracting archive');
    onLog?.(`==> Extracting archive into ${instanceDir}`);
    const zip = new AdmZip(zipPath);
    const entryCount = zip.getEntries().length;
    zip.extractAllTo(instanceDir, true);
    onLog?.(`  extracted ${entryCount} file(s)`);
    fs.rmSync(zipPath, { force: true });
    onLog?.('  removed temporary archive');

    const executable = isWindows ? 'bedrock_server.exe' : 'bedrock_server';
    if (!isWindows) {
      onLog?.(`==> Configuring environment: chmod +x ${executable} (Linux requires the execute bit)`);
      try {
        fs.chmodSync(path.join(instanceDir, executable), 0o755);
        onLog?.('  chmod OK');
      } catch (err) {
        logger.warn('Failed to chmod bedrock_server', err);
        onLog?.(`  chmod failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const versionMatch = link.downloadUrl.match(/bedrock-server-([\d.]+)\.zip/);
    onLog?.(`==> Installed Bedrock Dedicated Server ${versionMatch?.[1] ?? '(unknown version)'} for ${describeHost()}`);
    onProgress?.(100, 'Installed');
    return { jarFile: null, build: versionMatch?.[1] ?? null, executable };
  }

  throw new Error(`Unknown loader: ${loader}`);
}
