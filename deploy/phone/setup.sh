#!/data/data/com.termux/files/usr/bin/bash
# One-time phone setup — run inside Termux (installed from F-Droid):
#
#   curl -fsSLO https://raw.githubusercontent.com/saiabhiramjaini/green-branch/main/deploy/phone/setup.sh
#   bash setup.sh
#
# Installs Debian (proot-distro), clones GreenBranch into it, runs setup-debian.sh,
# registers the Termux:Boot script and starts everything. Safe to re-run.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/saiabhiramjaini/green-branch.git}"
DISTRO=debian

log() { printf '\n==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Where proot-distro keeps Debian's files: containers/<distro>/rootfs since v5,
# installed-rootfs/<distro> before that. Empty when Debian isn't installed.
rootfs() {
  local d
  for d in "$PREFIX/var/lib/proot-distro/containers/$DISTRO/rootfs" \
           "$PREFIX/var/lib/proot-distro/installed-rootfs/$DISTRO"; do
    [ -d "$d/root" ] && { echo "$d"; return; }
  done
}

arch=$(uname -m)
[ "$arch" = aarch64 ] || fail "This phone runs a $arch userspace; GreenBranch needs 64-bit ARM (aarch64)."

log "Termux packages"
pkg update -y
pkg install -y proot-distro openssh termux-tools

if [ -z "$(rootfs)" ]; then
  log "Installing Debian (one-time download)"
  proot-distro install "$DISTRO"
fi

log "GreenBranch inside Debian"
proot-distro login "$DISTRO" -- env REPO_URL="$REPO_URL" bash -c '
  set -e
  apt-get update -q && apt-get install -y -q git ca-certificates
  [ -d /root/green-branch/.git ] || git clone "$REPO_URL" /root/green-branch
  bash /root/green-branch/deploy/phone/setup-debian.sh
'

log "Start on boot (needs the Termux:Boot app from F-Droid, opened once)"
ROOTFS=$(rootfs)
[ -f "$ROOTFS/root/green-branch/deploy/phone/start.sh" ] || fail "Can't find Debian's files under $PREFIX/var/lib/proot-distro."
mkdir -p ~/.termux/boot
ln -sf "$ROOTFS/root/green-branch/deploy/phone/start.sh" ~/.termux/boot/greenbranch

# Start SSH whenever Termux is opened by hand, too
grep -q 'pgrep -x sshd' ~/.bashrc 2>/dev/null || echo 'pgrep -x sshd >/dev/null || sshd' >>~/.bashrc

log "Starting GreenBranch"
sh ~/.termux/boot/greenbranch

cat <<'EOF'

Next:
  • Set an SSH password if you haven't:   passwd
  • Check the backends (after ~30 s):    curl localhost:8000/api/v1/health; curl localhost:8001/api/v1/health
  • Finish the Cloudflare and GitHub Actions steps in deploy/phone/README.md
EOF
