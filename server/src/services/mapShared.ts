import fs from 'node:fs';
import { PNG } from 'pngjs';
import { mapCachePath, MAP_CACHE_DIR } from '../utils/paths.js';

export const MAX_OUTPUT_DIMENSION = 3000; // cap the PNG's longest side regardless of world size
export const MAX_WATER_DEPTH_SAMPLE = 32;

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

export interface ColumnResult {
  r: number;
  g: number;
  b: number;
}

// --- Block coloring -------------------------------------------------------
// Shared between the Java (Anvil/NBT) and Bedrock (LevelDB) renderers: both platforms use
// near-identical flattened block names ("red_wool", "oak_log", "grass_block", ...), so one
// color table covers both with only a small per-platform name-alias step (see
// bedrockMapService.ts's BEDROCK_NAME_ALIASES for the handful of real differences).

export const DYE_COLORS: Record<string, [number, number, number]> = {
  white: [234, 236, 237], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217],
  yellow: [248, 197, 39], lime: [112, 185, 25], pink: [237, 141, 172], gray: [62, 68, 71],
  light_gray: [142, 142, 134], cyan: [21, 137, 145], purple: [121, 42, 172], blue: [53, 57, 157],
  brown: [114, 71, 40], green: [84, 109, 27], red: [161, 39, 34], black: [20, 21, 25],
};

export const EXACT_COLORS: Record<string, [number, number, number]> = {
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

export const SKIP_TOP_SURFACE = new Set([
  'torch', 'wall_torch', 'soul_torch', 'soul_wall_torch', 'redstone_wire', 'redstone_torch',
  'redstone_wall_torch', 'tripwire', 'tripwire_hook', 'lever', 'ladder', 'vine', 'glow_lichen',
  'rail', 'powered_rail', 'detector_rail', 'activator_rail', 'sign', 'wall_sign', 'hanging_sign',
  'string', 'lightning_rod', 'end_rod', 'chain', 'bell', 'scaffolding',
]);

export function colorForBlockName(name: string): [number, number, number] {
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

export function shadeForWaterDepth(floor: [number, number, number], depth: number): ColumnResult {
  const t = Math.min(depth / MAX_WATER_DEPTH_SAMPLE, 0.75);
  const water = EXACT_COLORS.water;
  return {
    r: Math.round(floor[0] * (1 - t) + water[0] * t),
    g: Math.round(floor[1] * (1 - t) + water[1] * t),
    b: Math.round(floor[2] * (1 - t) + water[2] * t),
  };
}

// --- Output sizing & persistence -------------------------------------------

export function computeBlocksPerPixel(widthBlocksFull: number, heightBlocksFull: number): number {
  return Math.max(1, Math.ceil(Math.max(widthBlocksFull, heightBlocksFull) / MAX_OUTPUT_DIMENSION));
}

export async function writeMapPng(png: PNG, serverId: string): Promise<void> {
  fs.mkdirSync(MAP_CACHE_DIR, { recursive: true });
  const { image } = mapCachePath(serverId);
  await new Promise<void>((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(image)).on('finish', resolve).on('error', reject);
  });
}

export function writeMapMeta(serverId: string, meta: MapMeta): void {
  const { meta: metaPath } = mapCachePath(serverId);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}
