# MultiCraft

A self-hosted, web-based control panel for creating and running Minecraft servers — Java Edition (Vanilla, Paper, Purpur, Spigot) and Bedrock Edition — plus other SteamCMD-based dedicated game servers (Palworld, Project Zomboid, Valheim, Terraria, and any other Steam App ID). Create servers from your browser, manage players and plugins, edit settings and files, run console commands live, monitor resource usage, and schedule automatic backups and updates.

## Features

- **Server creation** — pick a platform (Java/Bedrock/Steam) and loader (Vanilla, Paper, Purpur, Spigot, Bedrock Dedicated Server, or a SteamCMD game), choose a version from the live catalog, and MultiCraft downloads and installs it for you. Spigot is compiled from source on the host via BuildTools (requires a full JDK + git).
- **Steam-based servers** — curated presets for Palworld, Project Zomboid, Valheim, and Terraria (correct App ID, default port, and shutdown behavior pre-filled), plus a free-form "Other" option for any Steam App ID. See [Steam-based servers](#steam-based-servers) below.
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
- **Process management**: server processes are plain child processes (`java -jar ...`, `bedrock_server`, or a game's own dedicated-server binary via steamcmd); console I/O and player join/leave events are parsed from stdout and streamed to the browser over WebSocket.
- **Downloads**: Vanilla via Mojang's version manifest, Paper via the PaperMC Fill API, Purpur via the PurpurMC API, Spigot via BuildTools (SpigotMC), Bedrock via Mojang's official download-links endpoint, Steam-based games via SteamCMD (downloaded automatically on first use). Plugin search/install uses the Modrinth API.
- **Updates**: Java loaders are updated by re-installing into the existing server directory (the installer only ever writes the jar, so world/config files are untouched); Bedrock is updated by extracting the new release over the existing directory while explicitly skipping `worlds/`, `server.properties`, `allowlist.json`, `whitelist.json`, and `permissions.json`; Steam-based games are updated by re-running `steamcmd +app_update`, which only touches files tracked by the game's own depot manifest.

## Steam-based servers

MultiCraft can also host dedicated servers for non-Minecraft games distributed via SteamCMD. When you create a server, choose the **Steam** platform, then pick a game:

- **Palworld** — App ID 2394010, default port 8211/UDP. Its dedicated server doesn't reliably respond to a clean stop signal (Pocketpair's own guidance is that graceful shutdown needs RCON), so MultiCraft force-stops it after a short grace period on Stop — its own periodic autosave is what's preserved, not a save-on-exit.
- **Project Zomboid** — App ID 380870, default port 16261/UDP. Stops cleanly via its own console `save`/`quit` sequence.
- **Valheim** — App ID 896660, default port 2456/UDP. Stops via SIGINT (Valheim only saves its world on SIGINT, not SIGTERM).
- **Terraria** — App ID 105600, default port 7777/TCP. Always started with `-autocreate`/`-world` so it never blocks waiting for interactive console input.
- **Other (custom App ID)** — enter any Steam App ID plus the relative path to its server executable. MultiCraft doesn't know a custom game's launch/shutdown behavior, so it sends SIGTERM (falling back to a forced stop after 60s) and marks it "running" as soon as the process starts.

Config files for Steam-based servers aren't parsed or edited by MultiCraft directly — use the **Files** tab to open whatever config file the game writes (INI, JSON, or otherwise). The Players, Operator, Whitelist, and Maps tabs are Minecraft-specific and don't apply to Steam-based servers.

SteamCMD itself is downloaded automatically (once, shared across all Steam-based servers) the first time you create one. On Linux, steamcmd is a 32-bit binary and needs matching 32-bit runtime libraries that most 64-bit-only servers don't have installed by default:

| Distro | Command |
|---|---|
| Debian/Ubuntu | `sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install lib32gcc-s1 lib32stdc++6` |
| Fedora | `sudo dnf install glibc.i686 libstdc++.i686` |
| openSUSE | `sudo zypper install libstdc++6-32bit glibc-32bit` |
| Arch | Enable `[multilib]` in `/etc/pacman.conf` first, then `sudo pacman -S lib32-gcc-libs` |

**Where SteamCMD comes from** is configurable from the Users page (admin-only, "SteamCMD" section): leave it blank for the default (download the official archive from Valve automatically), point it at a URL to use a mirror instead, point it at a local archive file to extract it with no network access at all, or point it at a directory that already has SteamCMD extracted in it to use that install as-is.

**Per-server SteamCMD options**: each server has a "Steam login" (defaults to `anonymous`; a real `username password` is needed for games that require an owned license — interactive Steam Guard prompts aren't supported) and "Extra steamcmd flags" field (raw arguments spliced into the install/update command line), both editable under Advanced options when creating a server and again later on its Settings tab.

`install.sh` offers to install these for you (opt-in, defaults to no) — see [Installation](#installation).

## Requirements

- **Node.js 22.5+** (for built-in `node:sqlite`) — Node 24 recommended.
- **Java 21+** on PATH (or `JAVA_HOME` set) — required to run Vanilla/Paper/Purpur/Spigot servers. Not needed for Bedrock- or Steam-only use.
- **A full JDK + git** — only if you plan to create Spigot servers (BuildTools compiles Spigot from source on the host).
- **32-bit runtime libraries** on Linux — only if you plan to create Steam-based servers (steamcmd itself is a 32-bit binary). See [Steam-based servers](#steam-based-servers) below.
- Windows, Linux, or macOS.

All server data (the SQLite database, every Minecraft server's files, and backups) lives under **`server/data/`** by default — this whole directory is git-ignored and is the only thing you need to preserve across updates, backups, or migrations. See [Moving `server/data/` outside the repo](#moving-serverdata-outside-the-repo-recommended-for-production) below.

## Installation

### Quick install (Linux)

On Debian/Ubuntu, Arch/Manjaro, or Fedora/RHEL, `install.sh` does steps 1–3 below for you — detects your distro, installs Node.js 22.5+/git/(optionally) Java, runs `npm run setup` and `npm run build`, verifies the panel actually responds, and asks whether to set it up as a systemd service that starts on boot:

```bash
git clone <this-repo-url> MultiCraft
cd MultiCraft
./install.sh
```

Pass `-y` to accept every default non-interactively (installs Java, skips the systemd prompt). Skip to [Running MultiCraft](#running-multicraft) once it finishes, or keep reading for the manual steps (also what the script does under the hood, if you want to follow along or you're on Windows/macOS/another distro).

### 1. Install the prerequisites

| | Windows | Linux (Debian/Ubuntu) | macOS |
|---|---|---|---|
| **Node.js 22.5+** | [nodejs.org](https://nodejs.org) installer, or `winget install OpenJS.NodeJS.LTS` | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo bash -` then `sudo apt install -y nodejs` (or use [nvm](https://github.com/nvm-sh/nvm)) | `brew install node` |
| **Java 21+** (Java servers only) | `winget install EclipseAdoptium.Temurin.21.JDK` | `sudo apt install -y openjdk-21-jre-headless` (or `-jdk` if you'll build Spigot) | `brew install openjdk@21` then `sudo ln -sfn $(brew --prefix openjdk@21)/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk` |
| **Git** (Spigot builds only) | `winget install Git.Git` | `sudo apt install -y git` | `brew install git` (or the Xcode Command Line Tools) |

Verify with `node -v`, `java -version`, and `git --version`. Running on Arch, Fedora, or openSUSE? See the per-distro package commands in [Running 24/7 → systemd](#option-b--systemd-linux-recommended-for-serversvps).

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

This is the same procedure on Arch, Debian/Ubuntu, Fedora/RHEL, openSUSE, or anything else running systemd — only the package-manager command in step 1 changes. Run everything below as a regular user with `sudo` access; don't run MultiCraft itself as root.

**1. Install prerequisites**

| Distro | Command |
|---|---|
| **Arch / Manjaro** | `sudo pacman -Syu --needed nodejs npm git jdk21-openjdk` |
| **Debian / Ubuntu** | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo bash -` then `sudo apt install -y nodejs git openjdk-21-jre-headless` |
| **Fedora / RHEL** | `sudo dnf install -y nodejs npm git java-21-openjdk-headless` |
| **openSUSE** | `sudo zypper install -y nodejs22 npm22 git java-21-openjdk-headless` |

Only install a JDK/JRE if you'll run Java-edition (Vanilla/Paper/Purpur/Spigot) servers — skip it for a Bedrock-only panel. Building Spigot needs the full `-jdk` package (e.g. `jdk21-openjdk` on Arch), not just the headless JRE. Verify with `node -v` (needs 22.5+) and `java -version`.

**2. Create a dedicated system user**

Running the panel as its own unprivileged user (rather than your login user or root) means a bug in a Minecraft server it manages can't touch the rest of the system.

```bash
sudo useradd --system --create-home --home-dir /opt/multicraft --shell "$(command -v nologin)" multicraft
```

(`nologin` lives at `/usr/sbin/nologin` on Debian/Ubuntu but `/usr/bin/nologin` on Arch/Fedora/openSUSE — `command -v nologin` finds whichever one applies.)

**3. Get the code and hand it to that user**

```bash
sudo git clone <this-repo-url> /opt/multicraft/app
sudo chown -R multicraft:multicraft /opt/multicraft
```

(No git remote yet? `sudo cp -r /path/to/your/MultiCraft/checkout /opt/multicraft/app` instead, then `chown` as above.)

**4. Install dependencies and build, as that user**

```bash
sudo -u multicraft bash -c 'cd /opt/multicraft/app && npm run setup && npm run build'
```

**5. Create the systemd unit** at `/etc/systemd/system/multicraft.service`:

```ini
[Unit]
Description=MultiCraft panel
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/multicraft/app
ExecStart=/usr/bin/npm start
# If `which npm` printed something else (e.g. an nvm install), use that path instead.
Restart=on-failure
User=multicraft
Environment=PORT=8642
Environment=MULTICRAFT_DATA_DIR=/opt/multicraft/data

[Install]
WantedBy=multi-user.target
```

`MULTICRAFT_DATA_DIR` keeps the database, every server's files, and backups outside the git checkout — see [Moving `server/data/` outside the repo](#moving-serverdata-outside-the-repo-recommended-for-production). Create it once: `sudo -u multicraft mkdir -p /opt/multicraft/data`.

**6. Enable and start it**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now multicraft
sudo systemctl status multicraft      # should show "active (running)"
journalctl -u multicraft -f           # follow logs; Ctrl+C to stop watching
```

Open `http://<server-ip>:8642` from another machine to reach the panel.

**7. Open the ports you need**

The panel's own port (`8642` by default) only needs to be reachable by whoever administers it — consider putting it behind a reverse proxy with HTTPS and/or restricting it to a VPN rather than exposing it publicly. Each *Minecraft* server you create needs its own port open to players: the port you set when creating it (default `25565/tcp` for Java, `19132/udp` for Bedrock).

- **Arch** ships with no firewall enabled by default. If you've installed one:
  - `ufw`: `sudo ufw allow 8642/tcp && sudo ufw allow 25565/tcp && sudo ufw allow 19132/udp`
  - `firewalld`: `sudo firewall-cmd --permanent --add-port=8642/tcp --add-port=25565/tcp --add-port=19132/udp && sudo firewall-cmd --reload`
  - plain `nftables`/`iptables`: add the equivalent `ACCEPT` rules for those ports in your existing ruleset.
- **Debian/Ubuntu** (`ufw`) and **Fedora/RHEL/openSUSE** (`firewalld`) — use the matching command above.
- If the machine is behind a home router, also forward those same ports to it there.

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

Updating means replacing the application code while leaving `server/data/` completely alone.

### Option A — `update.sh` (recommended)

```bash
./update.sh
```

This does the whole update for you, safely: backs up `server/data/` to a timestamped `.tar.gz` *before* touching anything, records the current commit so the code can be rolled back too, pulls with `git pull --ff-only` (refuses to guess through a merge — it stops and tells you what to do instead of forcing anything), rebuilds, and offers to start the new build once to confirm `/api/health` responds before it touches your live service. If that check fails, it offers to roll straight back to the exact commit you were on and rebuilds that instead. Nothing here ever deletes or modifies `server/data/`.

Flags: `./update.sh -y` runs it non-interactively (stashes local changes if any, tests the build, restarts a detected `multicraft.service` on success). `./update.sh --rollback` skips updating entirely and just restores the last pre-update commit it recorded, if you find a problem after the fact.

If you want an extra safety net on top of this regardless, [export the environment](#backing-up-and-restoring-the-whole-environment) first too.

### Option B — manual

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

## Left to implement
Implement a method to install and configure a Spigot/Mohist and SpongeForge server instance for Minecraft.
Make the webUI more interesting, less boring.
implement a customize launchable server jar file setting option so users can define what jar in the directory should launch.