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

## Getting started

```bash
npm run setup     # installs dependencies for the root, server, and web workspaces
npm run dev        # starts the API (port 8642) and the Vite dev server (port 5173) together
```

Open http://localhost:5173 — the first visit walks you through creating the initial admin account.

### Production

```bash
npm run build      # builds the API (server/dist) and the frontend (web/dist)
npm start           # serves the API and the built frontend together on one port
```

By default the panel listens on port `8642` (override with the `PORT` environment variable). All server files, backups, and the SQLite database live under `server/data/` (override with `MULTICRAFT_DATA_DIR`).

## Notes

- Creating a Java server requires accepting Mojang's EULA in the creation wizard; MultiCraft writes `eula.txt` accordingly.
- Operator tools and player op/kick/ban are applied via the live console, so the target server must be running. Whitelist/allowlist changes work either way.
- Resource usage (RAM/CPU) is sampled per-process using platform-native tools (`Get-Process` on Windows, `/proc` on Linux) — no extra agents required.
- Updating a server requires it to be stopped first; checking "create a backup first" in the Update tab takes a safety backup before touching any files.
