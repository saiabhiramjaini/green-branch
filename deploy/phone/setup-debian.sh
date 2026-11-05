#!/usr/bin/env bash
# Phone setup, part 2 — runs inside proot-distro Debian (setup.sh calls it).
# Installs the runtimes, the backends' Python dependencies and their .env files.
# Safe to re-run: existing .env files and the tunnel token are kept.
set -euo pipefail

ROOT=/root/green-branch
CONFIG_DIR=/root/.greenbranch
REPOS_DIR=/root/greenbranch-repos
NODE_MAJOR=24
export DEBIAN_FRONTEND=noninteractive
export PATH="/root/.local/bin:$PATH"

log() { printf '\n==> %s\n' "$*"; }

log "System packages (git, Python, Redis, build tools)"
apt-get update -q
apt-get install -y -q git curl ca-certificates gnupg build-essential \
  python3 python3-venv python3-pip redis-server

# Node.js — for repos under test and for PM2. Debian's own nodejs package is too old.
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt "$NODE_MAJOR" ]; then
  log "Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -q nodejs
fi
command -v pm2 >/dev/null || { log "PM2"; npm install -g pm2; }

if ! command -v uv >/dev/null; then
  log "uv (Python package manager)"
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

if ! command -v cloudflared >/dev/null; then
  log "cloudflared"
  curl -fsSL -o /tmp/cloudflared.deb \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
  apt-get install -y -q /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
fi

log "Python dependencies for server-ai and server-ec2"
(cd "$ROOT/server-ai" && uv sync --frozen --no-dev)
(cd "$ROOT/server-ec2" && uv sync --frozen --no-dev)

mkdir -p "$CONFIG_DIR" "$REPOS_DIR"
chmod 700 "$CONFIG_DIR"
new_key() { python3 -c 'import secrets; print(secrets.token_urlsafe(32))'; }

if [ ! -f "$ROOT/server-ec2/.env" ]; then
  log "Configuring server-ec2"
  read -rp "GitHub users/orgs whose repos GreenBranch may fix, comma-separated [saiabhiramjaini]: " owners
  cat >"$ROOT/server-ec2/.env" <<EOF
EC2_AGENT_EXECUTOR=local
EC2_AGENT_ALLOWED_REPO_OWNERS=${owners:-saiabhiramjaini}
EC2_AGENT_HOST=127.0.0.1
EC2_AGENT_PORT=8001
EC2_AGENT_API_KEY=$(new_key)
EC2_AGENT_REDIS_URL=redis://127.0.0.1:6379/0
EC2_AGENT_REPOS_BASE_PATH=$REPOS_DIR
EOF
  chmod 600 "$ROOT/server-ec2/.env"
fi
EC2_KEY=$(sed -n 's/^EC2_AGENT_API_KEY=//p' "$ROOT/server-ec2/.env")

if [ ! -f "$ROOT/server-ai/.env" ]; then
  log "Configuring server-ai"
  read -rsp "Groq API key (input hidden): " groq_key
  echo
  cat >"$ROOT/server-ai/.env" <<EOF
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
SERVER_UVICORN_WORKERS=1
SERVER_API_KEY=$(new_key)
SERVER_EC2_AGENT_URL=http://127.0.0.1:8001
SERVER_EC2_AGENT_API_KEY=$EC2_KEY
SERVER_GROQ_API_KEY=$groq_key
EOF
  chmod 600 "$ROOT/server-ai/.env"
fi
SERVER_KEY=$(sed -n 's/^SERVER_API_KEY=//p' "$ROOT/server-ai/.env")

if [ ! -f "$CONFIG_DIR/tunnel-token" ]; then
  log "Cloudflare Tunnel"
  echo "Paste the tunnel token from Cloudflare (Zero Trust → Networks → Tunnels → your tunnel),"
  read -rsp "or press Enter to add it later: " tunnel_token
  echo
  if [ -n "$tunnel_token" ]; then
    (umask 077 && printf '%s\n' "$tunnel_token" >"$CONFIG_DIR/tunnel-token")
  fi
fi

log "Done. Add these to the Vercel project's environment variables:"
cat <<EOF
  AGENT_SERVER_API_KEY=$SERVER_KEY
  EC2_AGENT_API_KEY=$EC2_KEY
EOF
