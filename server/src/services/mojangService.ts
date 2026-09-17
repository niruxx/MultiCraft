import crypto from 'node:crypto';

function formatUuid(hex32: string): string {
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

/**
 * Computes the deterministic "offline-mode" UUID Minecraft assigns to a player name
 * when the server runs with online-mode=false (equivalent to Java's
 * `UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(UTF_8))`, a version-3 MD5 UUID).
 */
export function offlineUuid(name: string): string {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30; // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  return formatUuid(hash.toString('hex'));
}

/** Looks up a Mojang (premium) account's UUID by username. Returns null if no such account exists. */
export async function lookupMojangUuid(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`, {
      headers: { 'User-Agent': 'MultiCraft-Panel' },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string; name: string };
    return formatUuid(data.id);
  } catch {
    return null;
  }
}

/**
 * Resolves the UUID that should be written into whitelist.json/ops.json for a player name,
 * honoring the server's online-mode setting so offline-editing produces entries the server
 * will actually match against at runtime.
 */
export async function resolvePlayerUuid(name: string, onlineMode: boolean): Promise<string> {
  if (!onlineMode) return offlineUuid(name);
  const uuid = await lookupMojangUuid(name);
  if (!uuid) {
    throw new Error(
      `Could not find a Mojang account named "${name}" (this server has online-mode enabled). Check the spelling, or disable online-mode for offline/cracked accounts.`
    );
  }
  return uuid;
}
