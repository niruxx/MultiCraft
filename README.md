# MultiCraft

A self-hosted, web-based control panel for creating and running Minecraft servers — Java Edition (Vanilla, Paper, Purpur, Spigot) and Bedrock Edition. Create servers from your browser, manage players and plugins, edit settings and files, run console commands live, monitor resource usage, and schedule automatic backups and updates.

## Features

- **Server creation** — pick a platform (Java/Bedrock) and loader (Vanilla, Paper, Purpur, Spigot, or Bedrock Dedicated Server), choose a version from the live catalog, and MultiCraft downloads and installs it for you. Spigot is compiled from source on the host via BuildTools (requires a full JDK + git).
- **Process control** — start, stop, restart, and force-kill servers; auto-start on panel boot.
- **Live console** — real-time console output over WebSocket, with a command input, history (↑/↓), and verbose install/update progress streaming.
- **Players** — see online/known players, op/de-op, whitelist, kick, and ban.
- **Operator tools** — broadcast messages, save-all, difficulty/gamemode/time/weather controls, and kick/ban/pardon by name, all from one tab.
- **Whitelist / allowlist** — a dedicated tab to enable enforcement and add/remove players. Works even while the server is stopped (edits `whitelist.json`/`allowlist.json` directly, resolving real Mojang UUIDs or the offline-mode UUID as appropriate).
- **Plugins** (Paper/Purpur/Spigot) — enable/disable/delete installed plugins, and a built-in Modrinth-powered search to find and install plugins, with a picker for which server to install to.
- **Settings editor** — memory, port, bind IP (`server-ip`), extra JVM/server args, and the raw `server.properties` file, all from the UI.
- **File manager** — browse, create, rename, delete, upload, download, and edit text files directly inside each server's directory (path-traversal safe).
- **Backups** — one-click manual backups (zip), download/restore/delete, and cron-based automatic backup schedules with retention limits.
- **Updates** — checks for newer builds/versions and updates a server in place, always preserving world data, `server.properties`, and allowlist/permissions files.
- **Resources monitor** — live CPU/RAM sparkline charts, host machine totals, and disk usage for each server.
- **Multi-user accounts with roles** — `admin` (full control + user management), `moderator` (manage assigned servers), `viewer` (read-only on assigned servers). Non-admins can be scoped to specific servers.
- **Environment backup & restore** — admins can export the *entire* install (database, every server, all backups) as one zip from the Users page, and import it into a fresh install to migrate or restore everything at once. See [Backing up and restoring the whole environment](#backing-up-and-restoring-the-whole-environment).
- **Factory reset** — a "Danger zone" on the Users page lets an admin wipe every account, server, and backup and return to the first-run setup wizard, gated behind a multi-step confirmation (what's deleted, a typed confirmation phrase, and your password).

## Architecture

```
MultiCraft/
├── server/     Node.js + TypeScript API (Express, ws, node:sqlite — zero native build deps)
└── web/        React + TypeScript + Vite + Tailwind single-page app
```

- **Database**: SQLite via Node's built-in `node:sqlite` — no external DB server, no native compilation.
- **Auth**: HMAC-signed session tokens + `scrypt` password hashing, both from Node's built-in `node:crypto` — no bcrypt/JWT native deps.
- **Process management**: server processes are plain child processes (`java -jar ...` or `bedrock_server`); console I/O and player join/leave events are parsed from stdout and streamed to the browser over WebSocket.
- **Downloads**: Vanilla via Mojang's version manifest, Paper via the PaperMC Fill API, Purpur via the PurpurMC API, Spigot via BuildTools (SpigotMC), Bedrock via Mojang's official download-links endpoint. Plugin search/install uses the Modrinth API.
- **Updates**: Java loaders are updated by re-installing into the existing server directory (the installer only ever writes the jar, so world/config files are untouched); Bedrock is updated by extracting the new release over the existing directory while explicitly skipping `worlds/`, `server.properties`, `allowlist.json`, `whitelist.json`, and `permissions.json`.

## Requirements

- **Node.js 22.5+** (for built-in `node:sqlite`) — Node 24 recommended.
- **Java 21+** on PATH (or `JAVA_HOME` set) — required to run Vanilla/Paper/Purpur/Spigot servers. Not needed for Bedrock-only use.
- **A full JDK + git** — only if you plan to create Spigot servers (BuildTools compiles Spigot from source on the host).
- Windows, Linux, or macOS.

All server data (the SQLite database, every Minecraft server's files, and backups) lives under **`server/data/`** by default — this whole directory is git-ignored and is the only thing you need to preserve across updates, backups, or migrations. See [Moving `server/data/` outside the repo](#moving-serverdata-outside-the-repo-recommended-for-production) below.

## Installation

### 1. Install the prerequisites

| | Windows | Linux (Debian/Ubuntu) | macOS |
|---|---|---|---|
| **Node.js 22.5+** | [nodejs.org](https://nodejs.org) installer, or `winget install OpenJS.NodeJS.LTS` | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo bash -` then `sudo apt install -y nodejs` (or use [nvm](https://github.com/nvm-sh/nvm)) | `brew install node` |
| **Java 21+** (Java servers only) | `winget install EclipseAdoptium.Temurin.21.JDK` | `sudo apt install -y openjdk-21-jre-headless` (or `-jdk` if you'll build Spigot) | `brew install openjdk@21` then `sudo ln -sfn $(brew --prefix openjdk@21)/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk` |
| **Git** (Spigot builds only) | `winget install Git.Git` | `sudo apt install -y git` | `brew install git` (or the Xcode Command Line Tools) |

Verify with `node -v`, `java -version`, and `git --version`.

### 2. Get the code

```bash
git clone <this-repo-url> MultiCraft
cd MultiCraft
```

(No remote yet? Just keep working from the folder you already have — everything below works the same either way.)

### 3. Install dependencies

```bash
npm run setup
```

This installs dependencies for the root, `server`, and `web` workspaces in one go (equivalent to `npm install` at the repo root).

## Running MultiCraft

These commands are identical on Windows, Linux, and macOS — they're plain `npm` scripts, run from the repo root in PowerShell, Terminal, or any shell.

### Development mode

```bash
npm run dev
```

Starts the API on `:8642` and the Vite dev UI on `:5173` together, with hot-reload. Open **http://localhost:5173** — the first visit walks you through creating the initial admin account.

### Production mode

```bash
npm run build      # builds server/dist and web/dist
npm start           # serves the API + the built frontend together on one port
```

Open **http://localhost:8642** (or whatever `PORT` you set). Use production mode for anything you intend to leave running — it's a single Node process instead of two dev servers.

### Platform notes

- **Windows**: run the commands above from PowerShell or `cmd.exe` in the repo folder. If you can't reach the panel from another device on your network, allow the port through **Windows Defender Firewall → Advanced settings → Inbound Rules → New Rule → Port** (TCP, the port from `PORT`, default `8642`).
- **Linux**: no special steps — works the same from any shell. If you're running headless on a VPS, see [Running 24/7](#running-247) below rather than leaving a terminal session open.
- **macOS**: no special steps. The first time you run `bedrock_server` or a downloaded jar, Gatekeeper may prompt about an unidentified developer — approve it once in **System Settings → Privacy & Security**.

## Running 24/7

Leaving a `npm start` terminal window open works, but it stops the moment you close the terminal, log out, or reboot. For an always-on panel, use a process manager appropriate to your OS. All of these restart MultiCraft automatically if it crashes and can start it on boot.

### Option A — pm2 (simplest, works on Windows/Linux/macOS)

```bash
npm install -g pm2
npm run build
pm2 start npm --name multicraft -- start
pm2 save
pm2 startup        # prints a command to run once, so pm2 restores on reboot
```

Useful commands: `pm2 logs multicraft`, `pm2 restart multicraft`, `pm2 stop multicraft`.

### Option B — systemd (Linux, recommended for servers/VPS)

Create `/etc/systemd/system/multicraft.service`:

```ini
[Unit]
Description=MultiCraft panel
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/MultiCraft
ExecStart=/usr/bin/npm start
Restart=on-failure
User=multicraft
Environment=PORT=8642
# Environment=MULTICRAFT_DATA_DIR=/var/lib/multicraft

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now multicraft
sudo systemctl status multicraft
journalctl -u multicraft -f      # follow logs
```

### Option C — Windows Service (via NSSM)

1. Download [NSSM](https://nssm.cc/download) and unzip it somewhere.
2. `npm run build` in the MultiCraft folder first.
3. From an elevated PowerShell:
   ```powershell
   nssm install MultiCraft
   ```
4. In the dialog: **Path** = `C:\Program Files\nodejs\node.exe`, **Startup directory** = your MultiCraft folder, **Arguments** = `server\dist\index.js`.
5. `nssm start MultiCraft` — it now runs as a service and survives reboots/logout. Manage it from `services.msc` or `nssm stop|restart MultiCraft`.

### Option D — macOS launchd

Create `~/Library/LaunchAgents/com.multicraft.panel.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.multicraft.panel</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/npm</string><string>start</string></array>
  <key>WorkingDirectory</key><string>/path/to/MultiCraft</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```

Then `launchctl load ~/Library/LaunchAgents/com.multicraft.panel.plist`.

> **Note:** the process manager above keeps the *panel itself* running. Whether an individual Minecraft server comes back up after a panel restart is controlled separately, per-server, by the **"Automatically start this server when the panel boots"** checkbox in that server's **Settings** tab.

## Wiping the database and starting fresh

Everything MultiCraft knows — user accounts, server records, every Minecraft server's files, and all backups — lives under `server/data/` (or wherever `MULTICRAFT_DATA_DIR` points). Wiping it resets MultiCraft to a brand-new install: the next page load shows the first-run setup wizard again.

**Easiest: do it from the UI.** As an admin, open the **Users** page and scroll to the **Danger zone** card → **Delete everything & start fresh**. It walks you through three confirmations (what gets deleted, typing `DELETE EVERYTHING`, and your password), then wipes every account, every server and its worlds, and every backup, and restarts the panel into the setup wizard. Your previous data isn't deleted outright — it's kept on disk as a timestamped `data-pre-reset-…` folder in case you didn't mean it, though restoring it means stopping MultiCraft and renaming that folder back to `data` by hand.

The manual, file-level equivalent (useful if the panel won't start at all, or you're scripting it) is below.

**This deletes all Minecraft worlds and backups too.** Back up `server/data/` first if there's anything in it you might want later (right-click → copy, or `cp -r`/`Copy-Item`).

1. Stop MultiCraft (`Ctrl+C` the dev/start process, or `pm2 stop multicraft` / `sudo systemctl stop multicraft` / `nssm stop MultiCraft`, etc.).
2. Delete the contents of the data directory:

   **Windows (PowerShell)**
   ```powershell
   Remove-Item -Recurse -Force .\server\data\*
   ```

   **Linux / macOS**
   ```bash
   rm -rf server/data/*
   ```
3. Start MultiCraft again. It recreates an empty database and shows the setup wizard on first load.

If you only want to reset *accounts and panel settings* while keeping your existing Minecraft servers untouched, that's not a simple file delete — server records in the database and the server folders on disk are linked by ID. Take a full backup of `server/data/` if you're unsure before deleting anything.

Tip: [exporting the environment](#backing-up-and-restoring-the-whole-environment) first gives you a single zip you can restore from if you change your mind, instead of a manual folder copy.

## Backing up and restoring the whole environment

Per-server backups (in each server's **Backups** tab) only cover that one server. For the whole install — every user account, every server's files and worlds, all of their backups, and the panel's settings — sign in as an **admin** and use the **Environment backup & restore** card at the top of the **Users** page:

- **Export environment** downloads a single `.zip` containing everything under `server/data/`. Use this to move MultiCraft to a new machine, or as a full-install safety net before something risky (an update, a database wipe, an import).
- **Import environment…** uploads a `.zip` from a previous export and replaces *everything* in the current install with it — all current users, servers, and backups are swapped out. This is for restoring a backup or migrating into a fresh install, not for merging.

What happens on import:

1. MultiCraft refuses if any server is currently running — stop them all first.
2. The archive is validated (it must actually contain a `multicraft.db`) and extracted.
3. Your **current** `server/data/` is renamed to `server/data-pre-import-<timestamp>/` — it is *not* deleted, so if anything looks wrong afterward you can stop MultiCraft, delete the new `data/`, and rename this folder back to `data/` to undo the import by hand.
4. The imported files take its place, and the panel process restarts itself to open the restored database.

After it restarts, reload the page and **sign in with an admin account from the backup you imported** — not necessarily the one you were using before, since the import may have replaced it.

Cross-platform reminder: importing an environment created on a different OS won't carry over platform-specific binaries — a Bedrock server exported from Windows still has `bedrock_server.exe`, not the Linux binary. Use that server's **Update** tab after importing to fetch the right one, or just recreate the server.

## Updating MultiCraft

Updating means replacing the application code while leaving `server/data/` completely alone. The steps below never touch that directory — but a couple of common commands (below) *do* wipe it if you're not careful, so read the warning first. If you want an extra safety net regardless, [export the environment](#backing-up-and-restoring-the-whole-environment) first — it's a one-click way to get everything back if an update ever goes sideways.

```bash
git pull                     # or however you fetch the new version
npm run setup                # picks up any new/changed dependencies
npm run build                # rebuild server/dist and web/dist
```

Then restart however you're running it:

- Plain `npm start` — stop it (`Ctrl+C`) and start it again.
- pm2 — `pm2 restart multicraft`
- systemd — `sudo systemctl restart multicraft`
- NSSM — `nssm restart MultiCraft`
- launchd — `launchctl kickstart -k gui/$UID/com.multicraft.panel`

**⚠️ Do not run `git clean -fdx` (or `-fd`) in the repo.** `server/data/` is git-ignored specifically so updates never touch it — but `git clean` deletes ignored files too, and would wipe your entire database, every Minecraft server, and all backups along with normal build output. Plain `git pull`, `npm install`, and `npm run build` are all safe; they only ever touch tracked source files and the `dist`/`node_modules` folders.

### Moving `server/data/` outside the repo (recommended for production)

For extra safety, point MultiCraft at a data directory outside the git repository entirely, so updates can never come near it regardless of what commands you run:

```bash
# Linux/macOS
export MULTICRAFT_DATA_DIR=/var/lib/multicraft
# Windows (PowerShell)
$env:MULTICRAFT_DATA_DIR = "C:\MultiCraftData"
```

Set this permanently in your service definition (see the `systemd`/NSSM examples above) rather than just in your shell, so it's picked up every time MultiCraft starts.

## Notes

- Creating a Java server requires accepting Mojang's EULA in the creation wizard; MultiCraft writes `eula.txt` accordingly.
- Operator tools and player op/kick/ban are applied via the live console, so the target server must be running. Whitelist/allowlist changes work either way.
- Resource usage (RAM/CPU) is sampled per-process using platform-native tools (`Get-Process` on Windows, `/proc` on Linux) — no extra agents required.
- Updating a *Minecraft* server (not the panel) requires it to be stopped first; checking "create a backup first" in its Update tab takes a safety backup before touching any files.
