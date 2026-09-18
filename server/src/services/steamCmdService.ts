import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { STEAMCMD_DIR } from '../utils/paths.js';
import { downloadFile, type LogFn } from '../utils/download.js';
import { runStreamed } from './downloadService.js';
import { SETTING_STEAMCMD_SOURCE, getSetting } from './systemSettingsService.js';

const STEAMCMD_WIN_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
const STEAMCMD_LINUX_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';

function steamCmdExecutablePath(): string {
  return path.join(STEAMCMD_DIR, process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function extractSteamCmdArchive(archivePath: string, onLog?: LogFn): Promise<void> {
  onLog?.('==> Extracting steamcmd');
  if (archivePath.toLowerCase().endsWith('.zip')) {
    new AdmZip(archivePath).extractAllTo(STEAMCMD_DIR, true);
  } else {
    await runStreamed('tar', ['-xzf', archivePath, '-C', STEAMCMD_DIR], STEAMCMD_DIR, onLog);
  }
}

/** steamcmd always self-updates on its very first run. On its very first run it also replaces
 *  its own binary as part of that self-update and the original process exits non-zero as part of
 *  the handoff — that's expected, not a failure, so it always gets one retry (a second run
 *  against the now-updated binary) before treating a failure as real. */
async function selfUpdateSteamCmd(exePath: string, onLog?: LogFn): Promise<void> {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(exePath, 0o755);
    } catch {
      // best-effort
    }
  }
  onLog?.('==> Running steamcmd once to let it self-update');
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await runStreamed(exePath, ['+quit'], STEAMCMD_DIR, onLog);
      return;
    } catch (err) {
      if (attempt === 2) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `steamcmd downloaded but failed to run (${message}). On Linux this usually means the 32-bit runtime ` +
            'libraries steamcmd needs are missing — see the README for the packages your distro needs, or re-run ' +
            'install.sh and accept the steamcmd dependencies prompt.'
        );
      }
      onLog?.('  (steamcmd exited non-zero after replacing its own binary during self-update — retrying once)');
    }
  }
}

/**
 * Resolves the shared steamcmd executable, bootstrapping it once if this is the first
 * Steam-platform server anyone has installed on this panel.
 *
 * Where it comes from is controlled by the admin-configurable "SteamCMD source" setting
 * (Settings page): left blank, it downloads the official Valve archive for this host's platform
 * (the default). Set to an http(s) URL, it downloads from that URL instead (e.g. an internal
 * mirror). Set to a local file path, it extracts that archive directly with no network access at
 * all ("manual tar"). Set to a local directory path, it uses the steamcmd executable already
 * inside that directory as-is, skipping download/extraction entirely.
 */
export async function ensureSteamCmd(onLog?: LogFn): Promise<string> {
  const source = getSetting(SETTING_STEAMCMD_SOURCE);
  const exePath = steamCmdExecutablePath();

  if (source && !isUrl(source)) {
    if (!fs.existsSync(source)) {
      throw new Error(`Configured SteamCMD source "${source}" does not exist — check Settings > SteamCMD.`);
    }
    if (fs.statSync(source).isDirectory()) {
      const localExe = path.join(source, process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');
      if (!fs.existsSync(localExe)) {
        throw new Error(
          `Configured SteamCMD directory "${source}" has no ${path.basename(localExe)} in it — check Settings > SteamCMD.`
        );
      }
      onLog?.(`==> Using the configured local SteamCMD install at ${source}`);
      return localExe;
    }
    // A local archive file: extract it once, no network access needed at all.
    if (fs.existsSync(exePath)) return exePath;
    fs.mkdirSync(STEAMCMD_DIR, { recursive: true });
    onLog?.(`==> Extracting the configured local SteamCMD archive: ${source}`);
    await extractSteamCmdArchive(source, onLog);
    if (!fs.existsSync(exePath)) {
      throw new Error(`Extracted "${source}" but ${path.basename(exePath)} was not found afterward`);
    }
    await selfUpdateSteamCmd(exePath, onLog);
    return exePath;
  }

  if (fs.existsSync(exePath)) return exePath;

  fs.mkdirSync(STEAMCMD_DIR, { recursive: true });
  const url = source ?? (process.platform === 'win32' ? STEAMCMD_WIN_URL : STEAMCMD_LINUX_URL);
  onLog?.(`==> steamcmd not found locally — downloading it once from ${url} (shared by all Steam-platform servers)`);
  const downloadPath = path.join(STEAMCMD_DIR, process.platform === 'win32' ? '_steamcmd.zip' : '_steamcmd.tar.gz');
  await downloadFile(url, downloadPath, undefined, onLog);
  await extractSteamCmdArchive(downloadPath, onLog);
  fs.rmSync(downloadPath, { force: true });

  if (!fs.existsSync(exePath)) {
    throw new Error(`steamcmd was downloaded but ${path.basename(exePath)} was not found after extracting it`);
  }
  await selfUpdateSteamCmd(exePath, onLog);
  return exePath;
}

/** Installs or updates a Steam app into instanceDir via `+app_update`. Safe to re-run — steamcmd
 *  only touches files tracked by the app's depot manifest, never save data living outside it.
 *  `login` is the raw value passed after `+login` (default "anonymous"; a real "user pass" is
 *  needed for games that require an owned license). `extraFlags` are additional raw steamcmd
 *  arguments spliced in before `+quit`, for advanced per-server customization. */
export async function steamAppUpdate(
  appId: string,
  instanceDir: string,
  onLog?: LogFn,
  validate = true,
  login = 'anonymous',
  extraFlags: string[] = []
): Promise<void> {
  const steamCmdPath = await ensureSteamCmd(onLog);
  fs.mkdirSync(instanceDir, { recursive: true });
  const loginArgs = login.trim() ? login.trim().split(/\s+/) : ['anonymous'];
  const args = [
    '+force_install_dir', instanceDir,
    '+login', ...loginArgs,
    '+app_update', appId,
    ...(validate ? ['validate'] : []),
    ...extraFlags,
    '+quit',
  ];
  const loginLog = loginArgs[0] === 'anonymous' ? 'anonymous' : `${loginArgs[0]} ***`;
  onLog?.(
    `==> steamcmd +force_install_dir <dir> +login ${loginLog} +app_update ${appId}${validate ? ' validate' : ''}` +
      `${extraFlags.length ? ' ' + extraFlags.join(' ') : ''} +quit`
  );
  await runStreamed(steamCmdPath, args, instanceDir, onLog);
}
