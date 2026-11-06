#!/usr/bin/env bash
# Deploys a commit on the phone. Runs inside proot-distro Debian; GitHub Actions streams it over SSH:
#   ssh phone 'proot-distro login debian -- bash -s -- <commit-sha>' < deploy/phone/deploy.sh
#
# Fast-forwards the checkout, syncs Python dependencies, restarts server-runner and server-ai
# (never the tunnel this deploy is running through), checks /health, and rolls back if unhealthy.
set -euo pipefail

SHA="${1:?usage: deploy.sh <commit-sha>}"
ROOT=/root/green-branch
ECOSYSTEM="$ROOT/deploy/phone/ecosystem.config.js"
export PATH="/root/.local/bin:$PATH"

log() { echo "==> $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# PM2 must already be running from start.sh; a daemon started here would live in this SSH session
PM2_PID_FILE=/root/.pm2/pm2.pid
{ [ -f "$PM2_PID_FILE" ] && kill -0 "$(cat "$PM2_PID_FILE")" 2>/dev/null; } \
  || fail "PM2 isn't running on the phone — run start.sh in Termux first"

cd "$ROOT"
[ -z "$(git status --porcelain --untracked-files=no)" ] \
  || fail "uncommitted changes in $ROOT on the phone; check git status there"
PREV=$(git rev-parse HEAD)

log "Updating ${PREV:0:8} → ${SHA:0:8}"
git fetch --quiet origin main
# Fast-forward only: never throws away commits made on the phone
git merge --ff-only --quiet "$SHA" || fail "cannot fast-forward to $SHA"

sync_deps() {
  (cd server-ai && uv sync --frozen --no-dev --quiet) && (cd server-runner && uv sync --frozen --no-dev --quiet)
}

restart() {
  pm2 startOrReload "$ECOSYSTEM" --only server-runner >/dev/null \
    && pm2 startOrReload "$ECOSYSTEM" --only server-ai >/dev/null
}

healthy() {
  for _ in $(seq 60); do
    if curl -fs -o /dev/null http://127.0.0.1:8001/api/v1/health \
      && curl -fs -o /dev/null http://127.0.0.1:8000/api/v1/health; then
      return 0
    fi
    sleep 1
  done
  return 1
}

log "Syncing dependencies and restarting"
if sync_deps && restart && healthy; then
  pm2 save >/dev/null
  log "Deployed ${SHA:0:8}"
  exit 0
fi

echo "Health check failed. Recent logs:" >&2
pm2 logs server-runner --lines 30 --nostream >&2 || true
pm2 logs server-ai --lines 30 --nostream >&2 || true

log "Rolling back to ${PREV:0:8}"
git reset --hard --quiet "$PREV"
sync_deps && restart && healthy && log "Previous version restored"
fail "deployment of $SHA failed"
