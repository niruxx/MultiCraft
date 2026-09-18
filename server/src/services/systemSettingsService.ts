import { prep } from '../db/db.js';

/** Known system setting keys. Anything not set here falls back to built-in defaults. */
export const SETTING_STEAMCMD_SOURCE = 'steamcmd_source';

export function getSetting(key: string): string | null {
  const row = prep('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  prep('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

export function clearSetting(key: string): void {
  prep('DELETE FROM system_settings WHERE key = ?').run(key);
}

export interface SystemSettings {
  steamcmdSource: string | null;
}

export function getSystemSettings(): SystemSettings {
  return {
    steamcmdSource: getSetting(SETTING_STEAMCMD_SOURCE),
  };
}
