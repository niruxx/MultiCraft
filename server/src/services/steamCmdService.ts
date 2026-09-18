import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { STEAMCMD_DIR } from '../utils/paths.js';
import { downloadFile, type LogFn } from '../utils/download.js';
import { runStreamed } from './downloadService.js';

const STEAMCMD_WIN_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
const STEAMCMD_LINUX_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';

function steamCmdExecutablePath(): string {
  return path.join(STEAMCMD_DIR, process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');
}

/** Resolves the shared steamcmd executable, downloading and self-updating it once if this is
 *  the first Steam-platform server anyone has installed on this panel. */
export async function ensureSteamCmd(onLog?: LogFn): Promise<string> {
  const exePath = steamCmdExecutablePath();
  if (fs.existsSync(exePath)) return exePath;

  fs.mkdirSync(STEAMCMD_DIR, { recursive: true });
  onLog?.('==> steamcmd not found locally — downloading it once (shared by all Steam-platform servers)');

  if (process.platform === 'win32') {
    const zipPath = path.join(STEAMCMD_DIR, '_steamcmd.zip');
    await downloadFile(STEAMCMD_WIN_URL, zipPath, undefined, onLog);
    onLog?.('==> Extracting steamcmd');
    new AdmZip(zipPath).extractAllTo(STEAMCMD_DIR, true);
    fs.rmSync(zipPath, { force: true });
  } else {
    const tarPath = path.join(STEAMCMD_DIR, '_steamcmd.tar.gz');
    await downloadFile(STEAMCMD_LINUX_URL, tarPath, undefined, onLog);
    onLog?.('==> Extracting steamcmd');
    await runStreamed('tar', ['-xzf', tarPath, '-C', STEAMCMD_DIR], STEAMCMD_DIR, onLog);
    fs.rmSync(tarPath, { force: true });
    fs.chmodSync(exePath, 0o755);
  }

  if (!fs.existsSync(exePath)) {
    throw new Error(`steamcmd was downloaded but ${path.basename(exePath)} was not found after extracting it`);
  }

  // steamcmd always self-updates on its very first run; do that once here (with a clear log
  // message) rather than letting it silently eat the first per-server install's opening minute.
  // On its very first run, steamcmd replaces its own binary as part of that self-update and the
  // original process exits non-zero as part of the handoff — that's expected, not a failure, so
  // it always gets one retry (a second run against the now-updated binary) before treating a
  // failure as real.
  onLog?.('==> Running steamcmd once to let it self-update');
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await runStreamed(exePath, ['+quit'], STEAMCMD_DIR, onLog);
      return exePath;
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
  return exePath;
}

/** Installs or updates a Steam app into instanceDir via `+app_update`. Safe to re-run — steamcmd
 *  only touches files tracked by the app's depot manifest, never save data living outside it. */
export async function steamAppUpdate(
  appId: string,
  instanceDir: string,
  onLog?: LogFn,
  validate = true
): Promise<void> {
  const steamCmdPath = await ensureSteamCmd(onLog);
  fs.mkdirSync(instanceDir, { recursive: true });
  const args = [
    '+force_install_dir', instanceDir,
    '+login', 'anonymous',
    '+app_update', appId,
    ...(validate ? ['validate'] : []),
    '+quit',
  ];
  onLog?.(`==> steamcmd +force_install_dir <dir> +login anonymous +app_update ${appId}${validate ? ' validate' : ''} +quit`);
  await runStreamed(steamCmdPath, args, instanceDir, onLog);
}
