# MultiCraft

A self-hosted, web-based control panel for creating and running Minecraft servers — Java Edition (Vanilla, Paper, Purpur) and Bedrock Edition. Create servers from your browser, manage players, edit settings and files, run console commands live, and schedule automatic backups.

## Features

- **Server creation** — pick a platform (Java/Bedrock) and loader (Vanilla, Paper, Purpur, or Bedrock Dedicated Server), choose a version from the live catalog, and MultiCraft downloads and installs it for you.
- **Process control** — start, stop, restart, and force-kill servers; auto-start on panel boot.
- **Live console** — real-time console output over WebSocket, with a command input, history (↑/↓), and install-progress streaming.
- **Player management** — see online/known players, op/de-op, whitelist, kick, and ban — applied live through the server console.
- **Settings editor** — edit panel-level settings (memory, port, extra JVM/server args) and the raw `server.properties` file from the UI.
- **File manager** — browse, create, rename, delete, upload, download, and edit text files directly inside each server's directory (path-traversal safe).
- **Backups** — one-click manual backups (zip), download/restore/delete, and cron-based automatic backup schedules with retention limits.
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
- **Downloads**: Vanilla via Mojang's version manifest, Paper via the PaperMC Fill API, Purpur via the PurpurMC API, Bedrock via Mojang's official download-links endpoint.

## Requirements

- **Node.js 22.5+** (for built-in `node:sqlite`) — Node 24 recommended.
- **Java 21+** on PATH (or `JAVA_HOME` set) — required to run Java Edition servers. Not needed for Bedrock-only use.
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
- Player management actions (op, whitelist, ban, kick) are applied via the live console, so the target server must be running.
- Resource usage (RAM/CPU) is sampled per-process using platform-native tools (`Get-Process` on Windows, `/proc` on Linux) — no extra agents required.
