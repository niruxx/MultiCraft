import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { readLevelDb } from 'mcbe-leveldb-reader';
import PrismarineRegistryFactory from 'prismarine-registry';
import PrismarineChunkFactoryImport from 'prismarine-chunk';
import { instanceDir } from '../utils/paths.js';
import { readServerProperties } from './propertiesService.js';
import { HttpError } from '../utils/asyncHandler.js';
import type { LogFn } from '../utils/download.js';
import type { ServerRecord } from '../types/index.js';
import {
  type MapMeta,
  SKIP_TOP_SURFACE,
  EXACT_COLORS,
  MAX_WATER_DEPTH_SAMPLE,
  colorForBlockName,
  shadeForWaterDepth,
  computeBlocksPerPixel,
  writeMapPng,
  writeMapMeta,
} from './mapShared.js';

// prismarine-chunk is a CJS module whose .d.ts declares an ESM `export default`, which trips up
// TS under NodeNext module resolution ("not callable") despite being correct at runtime — the
// same pattern already verified to work in this repo's own decode tests. Cast past the mismatch.
const PrismarineChunkFactory = PrismarineChunkFactoryImport as unknown as (
  registry: ReturnType<typeof PrismarineRegistryFactory>
) => new (opts: { x: number; z: number }) => BedrockChunkColumnLike;

// The exact Bedrock version barely matters for parsing: block *names* have been stable across
// recent versions even as internal numeric IDs churn every release, and prismarine-chunk's disk
// decoder resolves blocks by literal name+states (see loadLocalPalette), falling back to air for
// anything it doesn't recognize rather than throwing. A recent version just needs to know about
// as many block names as possible.
const REGISTRY_VERSIONS = ['bedrock_1.21.90', 'bedrock_1.21.50', 'bedrock_1.20.80'];

// Verified against prismarine-chunk's actual runtime source (src/bedrock/common/constants.js) —
// the package's own .d.ts declares these in a different (wrong) order, so these are hardcoded
// from source, not the type declaration.
const StorageType = { LocalPersistence: 0, NetworkPersistence: 1, Runtime: 2 } as const;

// LevelDB key tag bytes, cross-checked against PrismarineJS's bedrock-provider (the on-disk key
// scheme Mojang's own dedicated server uses): x(i32le) + z(i32le) [+ dim(i32le) if non-overworld]
// + tag(u8) [+ subchunk y(i8) for SubChunkPrefix].
const TAG_SUBCHUNK_PREFIX = 47; // '/'
const TAG_VERSION_NEW = 44; // ','
const TAG_VERSION_OLD = 118; // 'v'

// A handful of real naming differences between Bedrock's and Java's otherwise near-identical
// flattened block ids, found by inspecting Bedrock's static block-state table.
const BEDROCK_NAME_ALIASES: Record<string, string> = {
  grass_path: 'dirt_path',
  snow_layer: 'snow',
  snow: 'snow_block',
};

interface BedrockSectionLike {
  getBlock(layer: number, x: number, y: number, z: number): { name: string } | undefined;
}

interface BedrockChunkColumnLike {
  newSection(y: number, storageType: number, buffer: Buffer): BedrockSectionLike;
}

function worldDirFor(server: ServerRecord): string {
  const props = readServerProperties(server.id, server.platform);
  const levelName = props.find((p) => p.key === 'level-name')?.value?.trim() || 'Bedrock level';
  const dbDir = path.join(instanceDir(server.id), 'worlds', levelName, 'db');
  if (!fs.existsSync(dbDir)) {
    throw new HttpError(
      404,
      `No world found yet at "${levelName}" — start the server and let a player connect at least once so it generates spawn chunks.`
    );
  }
  return dbDir;
}

async function readWorldKeys(dbDir: string, onLog?: LogFn) {
  const names = await fsp.readdir(dbDir);
  const relevant = names.filter((n) => n.startsWith('MANIFEST') || n.endsWith('.ldb') || n.endsWith('.log'));
  onLog?.(`==> Reading ${relevant.length} LevelDB file(s) from the world's db/ folder`);
  const files = await Promise.all(
    relevant.map(async (name) => new File([await fsp.readFile(path.join(dbDir, name))], name))
  );
  return readLevelDb(files, {}); // {} logger silences mcbe-leveldb-reader's own console output
}

interface ChunkEntry {
  x: number;
  z: number;
  subchunks: Map<number, Buffer>; // subchunk y-index -> raw on-disk value bytes
}

function parseChunkKey(kb: Uint8Array): { x: number; z: number; dim: number; subchunkY?: number } | null {
  if (kb.length < 9) return null;
  const dv = new DataView(kb.buffer, kb.byteOffset, kb.byteLength);
  const overworld = kb.length === 9 || kb.length === 10;
  const otherDim = kb.length === 13 || kb.length === 14;
  if (!overworld && !otherDim) return null;

  const x = dv.getInt32(0, true);
  const z = dv.getInt32(4, true);
  const dim = otherDim ? dv.getInt32(8, true) : 0;
  const tagOffset = otherDim ? 12 : 8;
  const tag = kb[tagOffset];

  if (tag === TAG_SUBCHUNK_PREFIX) {
    if (kb.length !== tagOffset + 2) return null;
    const subchunkY = new DataView(kb.buffer, kb.byteOffset + tagOffset + 1, 1).getInt8(0);
    return { x, z, dim, subchunkY };
  }
  if (tag === TAG_VERSION_NEW || tag === TAG_VERSION_OLD) {
    if (kb.length !== tagOffset + 1) return null;
    return { x, z, dim };
  }
  return null;
}

async function collectChunks(dbDir: string, onLog?: LogFn): Promise<Map<string, ChunkEntry>> {
  const keys = await readWorldKeys(dbDir, onLog);
  const chunks = new Map<string, ChunkEntry>();
  for (const kv of keys.values()) {
    const kb = kv.keyBytes;
    if (!kb) continue;
    const info = parseChunkKey(kb);
    // Overworld only, matching the Java renderer's scope (dim 0 == overworld).
    if (!info || info.dim !== 0 || info.subchunkY === undefined || !kv.value) continue;
    const id = `${info.x},${info.z}`;
    let entry = chunks.get(id);
    if (!entry) {
      entry = { x: info.x, z: info.z, subchunks: new Map() };
      chunks.set(id, entry);
    }
    entry.subchunks.set(info.subchunkY, Buffer.from(kv.value));
  }
  return chunks;
}

async function openChunkColumnFactory(): Promise<new (opts: { x: number; z: number }) => BedrockChunkColumnLike> {
  let lastErr: unknown;
  for (const version of REGISTRY_VERSIONS) {
    try {
      const registry = PrismarineRegistryFactory(version);
      return PrismarineChunkFactory(registry);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not initialize a Bedrock chunk parser: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

function normalizeBedrockBlockName(name: string): string {
  return BEDROCK_NAME_ALIASES[name] ?? name;
}

function sampleColumn(sections: Map<number, BedrockSectionLike>, lx: number, lz: number): { r: number; g: number; b: number } | null {
  const sortedY = [...sections.keys()].sort((a, b) => b - a); // topmost subchunk first
  let waterDepth = 0;
  for (const subchunkY of sortedY) {
    const section = sections.get(subchunkY)!;
    for (let ly = 15; ly >= 0; ly--) {
      const block = section.getBlock(0, lx, ly, lz);
      if (!block || block.name === 'air') continue;
      const name = normalizeBedrockBlockName(block.name);
      if (SKIP_TOP_SURFACE.has(name)) continue;
      if (name === 'water') {
        waterDepth++;
        if (waterDepth <= MAX_WATER_DEPTH_SAMPLE) continue;
        return shadeForWaterDepth(EXACT_COLORS.stone, waterDepth);
      }
      const [r, g, b] = colorForBlockName(name);
      return waterDepth > 0 ? shadeForWaterDepth([r, g, b], waterDepth) : { r, g, b };
    }
  }
  return null; // column is entirely air/unexplored — leave transparent
}

export async function renderBedrockMap(server: ServerRecord, onLog?: LogFn): Promise<MapMeta> {
  const dbDir = worldDirFor(server);
  const chunks = await collectChunks(dbDir, onLog);
  if (chunks.size === 0) {
    throw new HttpError(404, 'The world folder exists but has no chunks yet — nothing has been generated/explored.');
  }
  onLog?.(`==> Found ${chunks.size} chunk(s) in the world's LevelDB store`);

  let minChunkX = Infinity, maxChunkX = -Infinity, minChunkZ = Infinity, maxChunkZ = -Infinity;
  for (const c of chunks.values()) {
    minChunkX = Math.min(minChunkX, c.x);
    maxChunkX = Math.max(maxChunkX, c.x);
    minChunkZ = Math.min(minChunkZ, c.z);
    maxChunkZ = Math.max(maxChunkZ, c.z);
  }

  const widthBlocksFull = (maxChunkX - minChunkX + 1) * 16;
  const heightBlocksFull = (maxChunkZ - minChunkZ + 1) * 16;
  const blocksPerPixel = computeBlocksPerPixel(widthBlocksFull, heightBlocksFull);
  const widthPx = Math.ceil(widthBlocksFull / blocksPerPixel);
  const heightPx = Math.ceil(heightBlocksFull / blocksPerPixel);
  const minBlockX = minChunkX * 16;
  const minBlockZ = minChunkZ * 16;

  onLog?.(`==> World spans ${widthBlocksFull}x${heightBlocksFull} blocks -> rendering at ${blocksPerPixel} block(s)/pixel (${widthPx}x${heightPx}px)`);

  const ChunkColumn = await openChunkColumnFactory();
  const png = new PNG({ width: widthPx, height: heightPx });
  png.data.fill(0); // fully transparent where nothing has been explored

  let chunksRendered = 0;
  let chunksChecked = 0;
  let lastLoggedPct = -1;
  const totalChunks = chunks.size;

  for (const entry of chunks.values()) {
    chunksChecked++;
    if (entry.subchunks.size === 0) continue;

    const baseBlockX = entry.x * 16;
    const baseBlockZ = entry.z * 16;
    if (blocksPerPixel > 1 && baseBlockX % blocksPerPixel >= 16 && baseBlockZ % blocksPerPixel >= 16) continue;

    let column: BedrockChunkColumnLike;
    const sections = new Map<number, BedrockSectionLike>();
    try {
      column = new ChunkColumn({ x: entry.x, z: entry.z });
      for (const [y, buf] of entry.subchunks) {
        sections.set(y, column.newSection(y, StorageType.LocalPersistence, buf));
      }
    } catch {
      continue; // corrupt/partial subchunk — skip rather than fail the whole render
    }
    if (sections.size === 0) continue;
    chunksRendered++;

    for (let lx = 0; lx < 16; lx += blocksPerPixel) {
      for (let lz = 0; lz < 16; lz += blocksPerPixel) {
        const worldX = baseBlockX + lx;
        const worldZ = baseBlockZ + lz;
        const px = Math.floor((worldX - minBlockX) / blocksPerPixel);
        const py = Math.floor((worldZ - minBlockZ) / blocksPerPixel);
        if (px < 0 || px >= widthPx || py < 0 || py >= heightPx) continue;

        let color: { r: number; g: number; b: number } | null;
        try {
          color = sampleColumn(sections, lx, lz);
        } catch {
          continue;
        }
        if (!color) continue;
        const idx = (widthPx * py + px) << 2;
        png.data[idx] = color.r;
        png.data[idx + 1] = color.g;
        png.data[idx + 2] = color.b;
        png.data[idx + 3] = 255;
      }
    }

    const pct = Math.round((chunksChecked / totalChunks) * 100);
    if (pct >= lastLoggedPct + 20) {
      lastLoggedPct = pct;
      onLog?.(`  ... ${pct}% (${chunksRendered} chunk(s) with data so far)`);
    }
  }

  await writeMapPng(png, server.id);

  const result: MapMeta = {
    generatedAt: new Date().toISOString(),
    widthPx,
    heightPx,
    blocksPerPixel,
    minBlockX,
    minBlockZ,
    chunksRendered,
    regionsScanned: chunks.size,
  };
  writeMapMeta(server.id, result);
  onLog?.(`==> Map rendered: ${widthPx}x${heightPx}px from ${chunksRendered} chunk(s)`);
  return result;
}
