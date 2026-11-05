// PM2 processes for running GreenBranch on an Android phone (inside proot-distro Debian).
// Started by start.sh; deploy.sh restarts only server-ec2 and server-ai.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const CONFIG_DIR = path.join(process.env.HOME || "/root", ".greenbranch");
const TUNNEL_TOKEN_FILE = path.join(CONFIG_DIR, "tunnel-token");

function which(bin) {
  try {
    return execSync(`command -v ${bin}`, { shell: "/bin/bash" }).toString().trim();
  } catch {
    return null;
  }
}

// A backend runs from its own uv-created virtualenv and reads its own .env
function pythonService(name, dir) {
  return {
    name,
    cwd: path.join(ROOT, dir),
    script: path.join(ROOT, dir, ".venv/bin/python"),
    args: ["-m", "src.app.api"],
    interpreter: "none",
    env: { PYTHONUNBUFFERED: "1" },
    kill_timeout: 10000,
    restart_delay: 3000,
  };
}

const apps = [
  {
    name: "redis",
    script: which("redis-server") || "/usr/bin/redis-server",
    // Sessions are snapshotted into CONFIG_DIR, so they survive a restart
    args: ["--bind", "127.0.0.1", "--port", "6379", "--dir", CONFIG_DIR],
    interpreter: "none",
  },
  pythonService("server-ec2", "server-ec2"),
  pythonService("server-ai", "server-ai"),
];

// The tunnel publishes server-ai, server-ec2 and SSH; it starts once its token is saved
if (fs.existsSync(TUNNEL_TOKEN_FILE)) {
  apps.push({
    name: "cloudflared",
    script: which("cloudflared") || "/usr/bin/cloudflared",
    args: ["tunnel", "--no-autoupdate", "run"],
    interpreter: "none",
    env: { TUNNEL_TOKEN: fs.readFileSync(TUNNEL_TOKEN_FILE, "utf8").trim() },
    restart_delay: 5000,
  });
}

module.exports = { apps };
