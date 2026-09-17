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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': 'MultiCraft-Panel' } });
  if (!res.ok) throw new Error(`Request to ${url} failed with status ${res.status}`);
  return (await res.json()) as T;
}

async function downloadFile(url: string, destination: string, onProgress?: (pct: number) => void) {
  const res = await fetch(url, { headers: { 'User-Agent': 'MultiCraft-Panel' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const total = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
  const out = fs.createWriteStream(destination);
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (total > 0 && onProgress) onProgress(Math.round((received / total) * 100));
  });
  nodeStream.pipe(out);
  await finished(out);
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

/** Downloads and installs the requested server software into `instanceDir`. */
export async function installServer(
  platform: Platform,
  loader: Loader,
  version: string,
  instanceDir: string,
  onProgress?: (pct: number, message: string) => void
): Promise<InstallResult> {
  fs.mkdirSync(instanceDir, { recursive: true });

  if (loader === 'vanilla') {
    onProgress?.(0, 'Resolving vanilla version metadata');
    const manifest = await fetchJson<{ versions: { id: string; url: string }[] }>(MOJANG_MANIFEST);
    const entry = manifest.versions.find((v) => v.id === version);
    if (!entry) throw new Error(`Unknown vanilla version: ${version}`);
    const detail = await fetchJson<{ downloads: { server: { url: string } } }>(entry.url);
    const jarFile = 'server.jar';
    onProgress?.(10, 'Downloading server.jar');
    await downloadFile(detail.downloads.server.url, path.join(instanceDir, jarFile), (pct) =>
      onProgress?.(10 + Math.round(pct * 0.85), 'Downloading server.jar')
    );
    onProgress?.(100, 'Installed');
    return { jarFile, build: null, executable: null };
  }

  if (loader === 'paper' || loader === 'purpur') {
    if (loader === 'paper') {
      onProgress?.(0, 'Resolving Paper build');
      const builds = await fetchJson<
        { id: number; channel: string; downloads: Record<string, { name: string; url: string }> }[]
      >(`${PAPER_API}/paper/versions/${version}/builds`);
      if (!builds.length) throw new Error(`No Paper builds found for version ${version}`);
      const best =
        builds.find((b) => b.channel === 'STABLE' || b.channel === 'DEFAULT') ?? builds[0];
      const download = best.downloads['server:default'] ?? Object.values(best.downloads)[0];
      const jarFile = download.name;
      onProgress?.(10, `Downloading ${jarFile}`);
      await downloadFile(download.url, path.join(instanceDir, jarFile), (pct) =>
        onProgress?.(10 + Math.round(pct * 0.85), `Downloading ${jarFile}`)
      );
      onProgress?.(100, 'Installed');
      return { jarFile, build: String(best.id), executable: null };
    } else {
      onProgress?.(0, 'Resolving Purpur build');
      const info = await fetchJson<{ builds: { latest: string } }>(`${PURPUR_API}/${version}`);
      const build = info.builds.latest;
      const jarFile = `purpur-${version}-${build}.jar`;
      const url = `${PURPUR_API}/${version}/${build}/download`;
      onProgress?.(10, `Downloading ${jarFile}`);
      await downloadFile(url, path.join(instanceDir, jarFile), (pct) =>
        onProgress?.(10 + Math.round(pct * 0.85), `Downloading ${jarFile}`)
      );
      onProgress?.(100, 'Installed');
      return { jarFile, build, executable: null };
    }
  }

  if (loader === 'bedrock') {
    onProgress?.(0, 'Resolving Bedrock dedicated server download');
    const data = await fetchJson<{ result: { links: { downloadType: string; downloadUrl: string }[] } }>(
      BEDROCK_LINKS_API
    );
    const platformKey = process.platform === 'win32' ? 'serverBedrockWindows' : 'serverBedrockLinux';
    const link = data.result.links.find((l) => l.downloadType === platformKey);
    if (!link) throw new Error('Could not resolve Bedrock server download link');
    const zipPath = path.join(instanceDir, '_bds_download.zip');
    onProgress?.(10, 'Downloading Bedrock dedicated server');
    await downloadFile(link.downloadUrl, zipPath, (pct) =>
      onProgress?.(10 + Math.round(pct * 0.7), 'Downloading Bedrock dedicated server')
    );
    onProgress?.(85, 'Extracting archive');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(instanceDir, true);
    fs.rmSync(zipPath, { force: true });
    const executable = process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(path.join(instanceDir, executable), 0o755);
      } catch (err) {
        logger.warn('Failed to chmod bedrock_server', err);
      }
    }
    const versionMatch = link.downloadUrl.match(/bedrock-server-([\d.]+)\.zip/);
    onProgress?.(100, 'Installed');
    return { jarFile: null, build: versionMatch?.[1] ?? null, executable };
  }

  throw new Error(`Unknown loader: ${loader}`);
}
