// prismarine-nbt and prismarine-provider-anvil have no published type definitions.
// Minimal ambient declarations covering only what mapService.ts actually uses.

declare module 'prismarine-provider-anvil' {
  export interface PCChunk {
    minY: number;
    worldHeight: number;
    getBlockType(pos: { x: number; y: number; z: number }): number;
    getBlock(pos: { x: number; y: number; z: number }): { name: string; type: number };
  }

  export interface AnvilInstance {
    load(x: number, z: number): Promise<PCChunk | null>;
  }

  export interface AnvilConstructor {
    new (worldPath: string): AnvilInstance;
  }

  export function Anvil(version: string): AnvilConstructor;
}

declare module 'prismarine-nbt' {
  export function parse(buffer: Buffer): Promise<{ parsed: unknown; type: string }>;
  export function simplify(nbt: unknown): Record<string, unknown>;
}
