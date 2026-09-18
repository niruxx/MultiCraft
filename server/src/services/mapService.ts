import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Anvil } from 'prismarine-provider-anvil';
import { instanceDir, mapCachePath, MAP_CACHE_DIR } from '../utils/paths.js';
import { readServerProperties } from './propertiesService.js';
import { HttpError } from '../utils/asyncHandler.js';
import type { LogFn } from '../utils/download.js';
import type { Loader, ServerRecord } from '../types/index.js';

/** Only the Bukkit/vanilla Anvil world format is supported for now — Bedrock's LevelDB world
 *  storage has no pure-JS reader and is a deliberately deferred follow-up (see project notes). */
export function isMapCapable(loader: Loader): boolean {
  return loader === 'vanilla' || loader === 'paper' || loader === 'purpur' || loader === 'spigot';
}

// The exact Minecraft version string barely matters for parsing: the on-disk chunk NBT layout
// has been unchanged since 1.18, so prismarine-chunk's "1.18" parser correctly reads any newer
// world too, even ones prismarine's own version list doesn't explicitly know about yet.
const CHUNK_FORMAT_FALLBACKS = ['1.21.1', '1.20.4', '1.19.4', '1.18.2', '1.18'];

const MAX_OUTPUT_DIMENSION = 3000; // cap the PNG's longest side regardless of world size
const MAX_WATER_DEPTH_SAMPLE = 32;
const REGION_RE = /^r\.(-?\d+)\.(-?\d+)\.mca$/;

// --- Block coloring -------------------------------------------------------

const DYE_COLORS: Record<string, [number, number, number]> = {
  white: [234, 236, 237], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217],
  yellow: [248, 197, 39], lime: [112, 185, 25], pink: [237, 141, 172], gray: [62, 68, 71],
  light_gray: [142, 142, 134], cyan: [21, 137, 145], purple: [121, 42, 172], blue: [53, 57, 157],
  brown: [114, 71, 40], green: [84, 109, 27], red: [161, 39, 34], black: [20, 21, 25],
};

const EXACT_COLORS: Record<string, [number, number, number]> = {
  grass_block: [95, 159, 53], tall_grass: [95, 159, 53], fern: [90, 150, 60], dirt: [134, 96, 67],
  coarse_dirt: [117, 85, 60], rooted_dirt: [134, 106, 71], podzol: [101, 76, 44], mycelium: [110, 89, 92],
  farmland: [117, 82, 55], dirt_path: [151, 114, 66], mud: [58, 59, 64], sand: [219, 207, 163],
  red_sand: [186, 100, 39], sandstone: [219, 207, 163], gravel: [136, 130, 127], clay: [161, 165, 176],
  stone: [125, 125, 125], granite: [149, 103, 86], diorite: [187, 187, 188], andesite: [136, 136, 137],
  deepslate: [77, 77, 82], calcite: [220, 219, 213], tuff: [108, 109, 96], moss_block: [86, 123, 44],
  snow: [249, 254, 254], snow_block: [249, 254, 254], powder_snow: [249, 254, 254],
  ice: [151, 202, 250], packed_ice: [141, 180, 250], blue_ice: [116, 168, 253],
  water: [63, 90, 214], lava: [214, 94, 16], obsidian: [20, 18, 29], bedrock: [85, 85, 85],
  netherrack: [111, 54, 52], soul_sand: [84, 64, 51], soul_soil: [75, 58, 45], basalt: [79, 79, 87],
  blackstone: [42, 36, 40], crimson_nylium: [140, 30, 33], warped_nylium: [22, 126, 134],
  end_stone: [219, 219, 165], cobblestone: [122, 122, 122], mossy_cobblestone: [107, 124, 99],
  terracotta: [152, 94, 68], cactus: [95, 128, 56], melon: [111, 145, 43], pumpkin: [201, 130, 32],
  glowstone: [172, 133, 79], magma_block: [147, 68, 42], honey_block: [232, 163, 26],
  sea_lantern: [172, 199, 190], prismarine: [99, 156, 151], kelp: [66, 106, 43], seagrass: [64, 122, 51],
};

const SKIP_TOP_SURFACE = new Set([
  'torch', 'wall_torch', 'soul_torch', 'soul_wall_torch', 'redstone_wire', 'redstone_torch',
  'redstone_wall_torch', 'tripwire', 'tripwire_hook', 'lever', 'ladder', 'vine', 'glow_lichen',
  'rail', 'powered_rail', 'detector_rail', 'activator_rail', 'sign', 'wall_sign', 'hanging_sign',
  'string', 'lightning_rod', 'end_rod', 'chain', 'bell', 'scaffolding',
]);

function colorForBlockName(name: string): [number, number, number] {
  const exact = EXACT_COLORS[name];
  if (exact) return exact;

  for (const [suffix, factor] of [
    ['_wool', 1.05], ['_carpet', 1.05], ['_concrete', 1], ['_concrete_powder', 1.1],
    ['_terracotta', 0.72], ['_glazed_terracotta', 0.85], ['_stained_glass', 0.9], ['_bed', 1],
  ] as const) {
    if (name.endsWith(suffix)) {
      const dyeName = name.slice(0, -suffix.length);
      const dye = DYE_COLORS[dyeName];
      if (dye) return dye.map((c) => Math.max(0, Math.min(255, Math.round(c * factor)))) as [number, number, number];
    }
  }

  if (name.endsWith('_log') || name.endsWith('_wood') || name.endsWith('_stem') || name.endsWith('_hyphae')) {
    return [107, 84, 51];
  }
  if (name.endsWith('_planks') || name.endsWith('_fence') || name.endsWith('_fence_gate') || name.endsWith('_slab') || name.endsWith('_stairs')) {
    return [168, 137, 90];
  }
  if (name.endsWith('_leaves')) return [60, 100, 40];
  if (name.endsWith('_sapling') || name.endsWith('_crop') || name === 'wheat' || name === 'carrots' || name === 'potatoes' || name === 'beetroots') {
    return [124, 158, 62];
  }
  if (name.endsWith('_ore')) return [128, 128, 128];
  if (name.endsWith('_mushroom_block') || name.endsWith('_mushroom')) return [155, 106, 78];
  if (name.endsWith('_glass') || name.endsWith('_glass_pane')) return [210, 230, 233];

  return [128, 128, 128];
}

interface ColumnResult {
  r: number;
  g: number;
  b: number;
}

function shadeForWaterDepth(floor: [number, number, number], depth: number): ColumnResult {
  const t = Math.min(depth / MAX_WATER_DEPTH_SAMPLE, 0.75);
  const water = EXACT_COLORS.water;
  return {
    r: Math.round(floor[0] * (1 - t) + water[0] * t),
    g: Math.round(floor[1] * (1 - t) + water[1] * t),
    b: Math.round(floor[2] * (1 - t) + water[2] * t),
  };
}

// --- World location ---------------------------------------------------------

function worldDirFor(server: ServerRecord): string {
  const props = readServerProperties(server.id, server.platform);
  const levelName = props.find((p) => p.key === 'level-name')?.value?.trim() || 'world';
  const dir = path.join(instanceDir(server.id), levelName);
  if (!fs.existsSync(path.join(dir, 'region'))) {
    throw new HttpError(404, `No world found yet at "${levelName}" — start the server at least once so it generates spawn chunks.`);
  }
  return dir;
}

async function openAnvil(worldDir: string, version: string) {
  const candidates = [version, ...CHUNK_FORMAT_FALLBACKS];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      const AnvilCtor = Anvil(candidate);
      const anvil = new AnvilCtor(worldDir);
      return anvil;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not initialize a chunk parser for version "${version}": ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

// --- Rendering ---------------------------------------------------------

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

export async function renderMap(server: ServerRecord, onLog?: LogFn): Promise<MapMeta> {
  if (!isMapCapable(server.loader)) {
    throw new HttpError(400, 'Map rendering currently supports Java worlds (Vanilla/Paper/Purpur/Spigot) only — Bedrock support is planned.');
  }

  const worldDir = worldDirFor(server);
  const regionDir = path.join(worldDir, 'region');
  const regionFiles = fs
    .readdirSync(regionDir)
    .map((name) => ({ name, match: name.match(REGION_RE) }))
    .filter((f): f is { name: string; match: RegExpMatchArray } => !!f.match)
    .map((f) => ({ name: f.name, rx: Number(f.match[1]), rz: Number(f.match[2]) }));

  if (regionFiles.length === 0) {
    throw new HttpError(404, 'The world folder exists but has no region files yet — nothing has been generated/explored.');
  }
  onLog?.(`==> Found ${regionFiles.length} region file(s) in ${path.relative(instanceDir(server.id), worldDir)}`);

  let minChunkX = Infinity, maxChunkX = -Infinity, minChunkZ = Infinity, maxChunkZ = -Infinity;
  for (const r of regionFiles) {
    minChunkX = Math.min(minChunkX, r.rx * 32);
    maxChunkX = Math.max(maxChunkX, r.rx * 32 + 31);
    minChunkZ = Math.min(minChunkZ, r.rz * 32);
    maxChunkZ = Math.max(maxChunkZ, r.rz * 32 + 31);
  }

  const widthBlocksFull = (maxChunkX - minChunkX + 1) * 16;
  const heightBlocksFull = (maxChunkZ - minChunkZ + 1) * 16;
  const blocksPerPixel = Math.max(1, Math.ceil(Math.max(widthBlocksFull, heightBlocksFull) / MAX_OUTPUT_DIMENSION));
  const widthPx = Math.ceil(widthBlocksFull / blocksPerPixel);
  const heightPx = Math.ceil(heightBlocksFull / blocksPerPixel);
  const minBlockX = minChunkX * 16;
  const minBlockZ = minChunkZ * 16;

  onLog?.(`==> World spans ${widthBlocksFull}x${heightBlocksFull} blocks -> rendering at ${blocksPerPixel} block(s)/pixel (${widthPx}x${heightPx}px)`);

  // Anvil's path argument must point directly at the region/ folder, not the world root —
  // it builds region-file paths as `${path}/r.x.z.mca` with no further subdirectory.
  const anvil = await openAnvil(regionDir, server.version);
  const png = new PNG({ width: widthPx, height: heightPx });
  png.data.fill(0); // fully transparent where nothing has been explored

  let chunksRendered = 0;
  let lastLoggedPct = -1;
  const totalChunks = regionFiles.length * 1024;
  let chunksChecked = 0;

  for (const region of regionFiles) {
    for (let cxLocal = 0; cxLocal < 32; cxLocal++) {
      for (let czLocal = 0; czLocal < 32; czLocal++) {
        chunksChecked++;
        const chunkX = region.rx * 32 + cxLocal;
        const chunkZ = region.rz * 32 + czLocal;

        // Skip chunks that don't map to at least one sampled pixel at this scale, to avoid
        // decompressing/parsing NBT we'd immediately throw away on heavily downsampled worlds.
        const baseBlockX = chunkX * 16;
        const baseBlockZ = chunkZ * 16;
        if (blocksPerPixel > 1 && baseBlockX % blocksPerPixel >= 16 && baseBlockZ % blocksPerPixel >= 16) continue;

        let chunk;
        try {
          chunk = await anvil.load(chunkX, chunkZ);
        } catch {
          continue; // corrupt/partial chunk — skip rather than fail the whole render
        }
        if (!chunk) continue;
        chunksRendered++;

        for (let lx = 0; lx < 16; lx += blocksPerPixel) {
          for (let lz = 0; lz < 16; lz += blocksPerPixel) {
            const worldX = baseBlockX + lx;
            const worldZ = baseBlockZ + lz;
            const px = Math.floor((worldX - minBlockX) / blocksPerPixel);
            const py = Math.floor((worldZ - minBlockZ) / blocksPerPixel);
            if (px < 0 || px >= widthPx || py < 0 || py >= heightPx) continue;

            const color = sampleColumn(chunk, lx, lz);
            if (!color) continue;
            const idx = (widthPx * py + px) << 2;
            png.data[idx] = color.r;
            png.data[idx + 1] = color.g;
            png.data[idx + 2] = color.b;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
    const pct = Math.round((chunksChecked / totalChunks) * 100);
    if (pct >= lastLoggedPct + 20) {
      lastLoggedPct = pct;
      onLog?.(`  ... ${pct}% (${chunksRendered} chunk(s) with data so far)`);
    }
  }

  fs.mkdirSync(MAP_CACHE_DIR, { recursive: true });
  const { image, meta } = mapCachePath(server.id);
  await new Promise<void>((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(image)).on('finish', resolve).on('error', reject);
  });

  const result: MapMeta = {
    generatedAt: new Date().toISOString(),
    widthPx,
    heightPx,
    blocksPerPixel,
    minBlockX,
    minBlockZ,
    chunksRendered,
    regionsScanned: regionFiles.length,
  };
  fs.writeFileSync(meta, JSON.stringify(result, null, 2));
  onLog?.(`==> Map rendered: ${widthPx}x${heightPx}px from ${chunksRendered} chunk(s)`);
  return result;
}

function sampleColumn(chunk: import('prismarine-provider-anvil').PCChunk, lx: number, lz: number): ColumnResult | null {
  const topY = chunk.minY + chunk.worldHeight - 1;
  let waterDepth = 0;
  for (let y = topY; y >= chunk.minY; y--) {
    const pos = { x: lx, y, z: lz };
    if (chunk.getBlockType(pos) === 0) continue; // air
    const block = chunk.getBlock(pos);
    if (SKIP_TOP_SURFACE.has(block.name)) continue;
    if (block.name === 'water' || block.name === 'flowing_water') {
      waterDepth++;
      if (waterDepth <= MAX_WATER_DEPTH_SAMPLE) continue;
      return shadeForWaterDepth(EXACT_COLORS.stone, waterDepth);
    }
    const [r, g, b] = colorForBlockName(block.name);
    return waterDepth > 0 ? shadeForWaterDepth([r, g, b], waterDepth) : { r, g, b };
  }
  return null; // column is entirely air/void — leave transparent
}

export function getMapMeta(serverId: string): MapMeta | null {
  const { meta } = mapCachePath(serverId);
  if (!fs.existsSync(meta)) return null;
  try {
    return JSON.parse(fs.readFileSync(meta, 'utf8'));
  } catch {
    return null;
  }
}

export function getMapImagePath(serverId: string): string {
  const { image } = mapCachePath(serverId);
  if (!fs.existsSync(image)) throw new HttpError(404, 'No map has been generated yet');
  return image;
}
