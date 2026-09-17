import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

/** Verbose, line-by-line log callback — mirrors what `npm install --verbose` prints. */
export type LogFn = (line: string) => void;

export function formatBytes(bytes: number): string {
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

export async function fetchJson<T>(url: string, onLog?: LogFn): Promise<T> {
  onLog?.(`> GET ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'MultiCraft-Panel' } });
  if (!res.ok) throw new Error(`Request to ${url} failed with status ${res.status}`);
  return (await res.json()) as T;
}

/** Streams a URL to disk, logging periodic byte-progress lines the same way a verbose installer would. */
export async function downloadFile(
  url: string,
  destination: string,
  onProgress?: (pct: number) => void,
  onLog?: LogFn
): Promise<void> {
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
