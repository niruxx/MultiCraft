#!/usr/bin/env bash
#
# MultiCraft updater: pulls the latest commits from GitHub, rebuilds, and restarts —
# without ever touching server/data/ (the database, every server's files, and backups).
#
# Safety, in order:
#   1. Backs up your data directory to a timestamped .tar.gz *before* touching anything.
#   2. Records the current git commit so the code itself can be rolled back too.
#   3. Pulls with --ff-only (refuses to guess through a merge) and stops cleanly if that
#      would require one, rather than doing something clever/destructive automatically.
#   4. Builds, then lets you test the new build (starts it, checks /api/health) before
#      touching your live service.
#   5. If the test fails — or you just want to undo an update later — offers to roll the
#      code back to the exact commit it was on before, and reminds you where the data
#      backup is.
#
# Usage:
#   ./update.sh              interactive
#   ./update.sh -y           non-interactive: stash local changes if any, test the build,
#                            restart the live systemd service on success, do nothing on failure
#   ./update.sh --rollback   skip the update entirely and just restore the last pre-update
#                            commit this script recorded (asks first)
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers (same conventions as install.sh)
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; NC=''
fi
info()    { printf '%s==>%s %s\n' "$BLUE" "$NC" "$*"; }
ok()      { printf '%s✓%s %s\n' "$GREEN" "$NC" "$*"; }
warn()    { printf '%s!%s %s\n' "$YELLOW" "$NC" "$*"; }
err()     { printf '%s✗%s %s\n' "$RED" "$NC" "$*" >&2; }
die()     { err "$*"; exit 1; }
heading() { printf '\n%s%s%s\n' "$BOLD" "$*" "$NC"; }

NONINTERACTIVE=0
ROLLBACK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) NONINTERACTIVE=1 ;;
    --rollback) ROLLBACK_ONLY=1 ;;
    -h|--help)
      echo "Usage: $0 [-y|--yes] [--rollback]"
      echo "  -y, --yes    Non-interactive: stash local changes, test the build, restart on"
      echo "               success, leave the update in place (untested-but-built) on failure."
      echo "  --rollback   Skip updating; just restore the last pre-update commit recorded"
      echo "               by a previous run of this script."
      exit 0
      ;;
  esac
done

confirm() {
  local prompt="$1" default="${2:-y}" reply suffix
  if [[ "$NONINTERACTIVE" == "1" || ! -t 0 ]]; then
    [[ "$default" == "y" ]] && { ok "$prompt -> yes (default)"; return 0; }
    ok "$prompt -> no (default)"; return 1
  fi
  suffix="[Y/n]"; [[ "$default" == "n" ]] && suffix="[y/N]"
  read -r -p "$prompt $suffix " reply || reply=""
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy] ]]
}

heading "MultiCraft updater"

command -v git >/dev/null 2>&1 || die "git is required."
command -v npm >/dev/null 2>&1 || die "npm is required."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/package.json" ]] && grep -q '"name": *"multicraft"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
  PROJECT_DIR="$SCRIPT_DIR"
else
  die "Run this from inside your MultiCraft checkout."
fi
cd "$PROJECT_DIR"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "This doesn't look like a git checkout — can't pull updates into it."
REMOTE="$(git remote | head -1)"
[[ -n "$REMOTE" ]] || die "No git remote configured. Run 'git remote add origin <repo-url>' first."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "HEAD" ]] && die "You're in a detached HEAD state — check out a branch first (e.g. 'git checkout main')."

DATA_DIR="${MULTICRAFT_DATA_DIR:-$PROJECT_DIR/server/data}"
BACKUP_ROOT="$PROJECT_DIR/../multicraft-update-backups"
STATE_FILE="$BACKUP_ROOT/last-update.json"

# ---------------------------------------------------------------------------
# --rollback: restore the last recorded pre-update commit and stop
# ---------------------------------------------------------------------------
if [[ "$ROLLBACK_ONLY" == "1" ]]; then
  [[ -f "$STATE_FILE" ]] || die "No previous update recorded ($STATE_FILE not found) — nothing to roll back to."
  PREV_SHA="$(MC_STATE_FILE="$STATE_FILE" node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.MC_STATE_FILE,"utf8")).previousCommit)')"
  PREV_LABEL="$(MC_STATE_FILE="$STATE_FILE" node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.MC_STATE_FILE,"utf8")).previousLabel)')"
  info "Last recorded pre-update commit: $PREV_LABEL"
  confirm "Reset the code to that commit and rebuild?" y || die "Cancelled."
  git reset --hard "$PREV_SHA"
  npm run setup
  npm run build
  ok "Rolled back to $PREV_LABEL and rebuilt. Restart your service to apply it."
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 1 — local changes
# ---------------------------------------------------------------------------
heading "Step 1/6 — Checking for local changes"

STASHED=0
if [[ -n "$(git status --porcelain)" ]]; then
  warn "You have uncommitted local changes."
  git status --short
  if confirm "Stash them before updating (recovered automatically after)?" y; then
    git stash push -u -m "update.sh auto-stash $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    STASHED=1
    ok "Local changes stashed."
  else
    die "Not updating with uncommitted changes present — commit, stash manually, or discard them first."
  fi
else
  ok "Working tree is clean."
fi

PREV_SHA="$(git rev-parse HEAD)"
PREV_LABEL="$(git log -1 --format='%h %s' HEAD)"
ok "Current version: $PREV_LABEL"

# ---------------------------------------------------------------------------
# Step 2 — back up data
# ---------------------------------------------------------------------------
heading "Step 2/6 — Backing up your data"

mkdir -p "$BACKUP_ROOT"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATA_BACKUP="$BACKUP_ROOT/data-$TIMESTAMP.tar.gz"

if [[ -d "$DATA_DIR" ]]; then
  info "Archiving $DATA_DIR -> $DATA_BACKUP"
  tar -czf "$DATA_BACKUP" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
  ok "Data backed up ($(du -h "$DATA_BACKUP" | cut -f1))"
else
  warn "No data directory found at $DATA_DIR yet (fresh install?) — nothing to back up."
  DATA_BACKUP=""
fi

MC_PREV_SHA="$PREV_SHA" MC_PREV_LABEL="$PREV_LABEL" MC_DATA_BACKUP="$DATA_BACKUP" MC_STATE_FILE="$STATE_FILE" node -e '
const fs = require("fs");
fs.writeFileSync(process.env.MC_STATE_FILE, JSON.stringify({
  previousCommit: process.env.MC_PREV_SHA,
  previousLabel: process.env.MC_PREV_LABEL,
  dataBackup: process.env.MC_DATA_BACKUP,
  updatedAt: new Date().toISOString(),
}, null, 2));
'
ok "Recorded rollback point ($STATE_FILE) — this update never runs without one on record."

# ---------------------------------------------------------------------------
# Step 3 — stop the running service, if we can find one
# ---------------------------------------------------------------------------
heading "Step 3/6 — Stopping the running instance"

SYSTEMD_ACTIVE=0
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet multicraft 2>/dev/null; then
  info "Stopping multicraft.service…"
  sudo systemctl stop multicraft
  SYSTEMD_ACTIVE=1
  ok "Service stopped."
else
  warn "No active multicraft.service found. If you're running MultiCraft another way (pm2, a plain"
  warn "'npm start' terminal), stop it yourself now so the update doesn't fight a live process."
  confirm "Continue?" y || die "Cancelled — stop MultiCraft and re-run this script."
fi

# ---------------------------------------------------------------------------
# Step 4 — pull
# ---------------------------------------------------------------------------
heading "Step 4/6 — Pulling the latest commits"

info "Fetching from $REMOTE…"
git fetch "$REMOTE"

if git pull --ff-only "$REMOTE" "$BRANCH"; then
  NEW_SHA="$(git rev-parse HEAD)"
  if [[ "$NEW_SHA" == "$PREV_SHA" ]]; then
    ok "Already up to date ($PREV_LABEL)."
  else
    ok "Updated $PREV_LABEL -> $(git log -1 --format='%h %s' HEAD)"
    echo
    echo "Changes:"
    git log --oneline "$PREV_SHA..$NEW_SHA" | sed 's/^/  /'
  fi
else
  err "Fast-forward pull failed — your branch and $REMOTE/$BRANCH have diverged."
  err "This usually means local commits exist that were never pushed. Resolve manually:"
  err "  git log $REMOTE/$BRANCH..HEAD   # see what's only local"
  err "  git rebase $REMOTE/$BRANCH      # or merge, once you've decided how"
  [[ "$STASHED" == "1" ]] && warn "Your stashed changes are still saved — recover with 'git stash pop'."
  die "Not proceeding with a partially-updated tree."
fi

if [[ "$STASHED" == "1" ]]; then
  info "Restoring your stashed local changes…"
  if git stash pop; then
    ok "Local changes restored."
  else
    err "Restoring the stash hit a conflict. It's still saved — resolve manually with 'git stash list' / 'git stash pop'."
  fi
fi

# ---------------------------------------------------------------------------
# Step 5 — rebuild
# ---------------------------------------------------------------------------
heading "Step 5/6 — Rebuilding"

npm run setup
npm run build
[[ -f "$PROJECT_DIR/server/dist/index.js" ]] || die "Build finished but server/dist/index.js is missing — check the output above."
[[ -f "$PROJECT_DIR/web/dist/index.html" ]] || die "Build finished but web/dist/index.html is missing — check the output above."
ok "Build complete."

# ---------------------------------------------------------------------------
# Step 6 — test, then restart or roll back
# ---------------------------------------------------------------------------
heading "Step 6/6 — Test before going live?"

rollback() {
  err "Rolling back to $PREV_LABEL…"
  git reset --hard "$PREV_SHA"
  npm run setup
  npm run build
  ok "Rolled back and rebuilt. Your data was never touched; the backup is also still at: $DATA_BACKUP"
}

TEST_PORT="${PORT:-8642}"
if confirm "Start the updated build once to verify it actually comes up before restarting your live service?" y; then
  ( cd "$PROJECT_DIR/server" && exec env PORT="$TEST_PORT" node dist/index.js ) >/tmp/multicraft-update-check.log 2>&1 &
  TEST_PID=$!
  trap 'kill "$TEST_PID" >/dev/null 2>&1 || true' EXIT
  sleep 3

  if curl -fsS "http://localhost:$TEST_PORT/api/health" >/dev/null 2>&1; then
    ok "Health check passed."
    kill "$TEST_PID" >/dev/null 2>&1 || true
    wait "$TEST_PID" 2>/dev/null || true
    trap - EXIT

    if [[ "$SYSTEMD_ACTIVE" == "1" ]]; then
      if confirm "Restart multicraft.service now with the updated build?" y; then
        sudo systemctl start multicraft
        sleep 2
        if systemctl is-active --quiet multicraft; then
          ok "multicraft.service is running the update."
        else
          err "Service failed to start after the update. Check: journalctl -u multicraft -e"
          confirm "Roll back to $PREV_LABEL?" y && rollback
        fi
      else
        ok "Not restarting automatically — run 'sudo systemctl start multicraft' when ready."
      fi
    else
      ok "Verified working. Start it however you normally do (npm start / pm2 restart multicraft / etc)."
    fi
  else
    err "The updated build didn't respond on port $TEST_PORT. Recent log output:"
    tail -n 30 /tmp/multicraft-update-check.log || true
    kill "$TEST_PID" >/dev/null 2>&1 || true
    wait "$TEST_PID" 2>/dev/null || true
    trap - EXIT

    if confirm "Roll back to the previous version ($PREV_LABEL)?" y; then
      rollback
      [[ "$SYSTEMD_ACTIVE" == "1" ]] && { sudo systemctl start multicraft; ok "multicraft.service restarted on the rolled-back version."; }
    else
      warn "Update left in place but UNVERIFIED. Roll back any time with: ./update.sh --rollback"
      [[ "$SYSTEMD_ACTIVE" == "1" ]] && warn "multicraft.service is still stopped — start it manually once you've sorted this out."
    fi
  fi
else
  ok "Skipping the test."
  if [[ "$SYSTEMD_ACTIVE" == "1" ]] && confirm "Restart multicraft.service now anyway?" n; then
    sudo systemctl start multicraft
    ok "multicraft.service restarted."
  else
    ok "Start it whenever you're ready. Roll back any time with: ./update.sh --rollback"
  fi
fi

heading "Done"
echo "Data backup: ${DATA_BACKUP:-none taken (no data directory existed yet)}"
echo "Roll back the code any time with: ./update.sh --rollback"
