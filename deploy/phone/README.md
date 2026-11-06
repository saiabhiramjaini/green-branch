# Running the GreenBranch backends on an Android phone

`server-ai` and `server-runner` run on an old Android phone instead of a cloud server. The
frontend stays on Vercel.

```
Vercel (frontend) ──HTTPS / WSS──▶ Cloudflare Tunnel ──▶ phone (Termux → Debian → PM2)
                                                         ├─ server-ai   127.0.0.1:8000
                                                         ├─ server-runner  127.0.0.1:8001
                                                         ├─ redis       127.0.0.1:6379
                                                         └─ cloudflared
GitHub Actions ──SSH through the tunnel──▶ sshd :8022 (Termux) → deploy.sh
```

- **Debian inside Termux (proot-distro):** the Python backends and the repos under test
  install normal Linux ARM packages there. Termux's own environment can't use most of them.
- **`server-runner` uses the `local` executor:** the phone has no Docker, so each repo's
  `npm install` / `pytest` runs as a normal process on the phone. There is no sandbox, so
  `RUNNER_ALLOWED_REPO_OWNERS` limits cloning to your own repos. Keep it that way:
  code from an allowed repo can read anything on the phone, including the `.env` files.
- **Both backends listen on 127.0.0.1 only.** Only the tunnel can reach them.

## What you need

- An Android phone with a **64-bit** userspace. In Termux, `uname -m` must print `aarch64`.
  Plan on 4 GB+ of RAM and 10 GB+ of free storage.
- **Termux** and **Termux:Boot** from [F-Droid](https://f-droid.org). Both must come from
  the same source.
- A Cloudflare account with your domain on it (free plan), and a
  [Groq API key](https://console.groq.com).

## 1. Prepare the phone

Android kills background apps aggressively. On ColorOS (Oppo), set these. Menu names vary
by version:

- **Settings → Battery → App battery management → Termux** and **Termux:Boot:** allow
  background activity, allow auto launch, and turn off optimisation.
- **Recent apps:** lock Termux (long-press its card → Lock).
- **Termux:Boot:** open it once. Android only runs boot apps that have been opened.
- **Screen lock:** a PIN keeps Termux:Boot from running after a reboot until the phone is
  unlocked. Set it to Swipe/None if the phone should recover without you.
- **Battery health:** if your phone has a charge limit (often called "Protect battery"),
  turn it on, since the phone stays plugged in.
- **Optional:** reserve the phone's IP in your router (DHCP reservation), so SSH from your
  laptop keeps working.

On Android 12 and later, also turn off the limit that kills Termux's child processes. On
Android 14+, use **Developer options → Disable child process restrictions**. On Android
12/13, run this from a computer with `adb`:
`adb shell "/system/bin/device_config set_sync_disabled_for_tests persistent; /system/bin/device_config put activity_manager max_phantom_processes 2147483647"`.

## 2. Run the setup (on the phone, in Termux)

```bash
curl -fsSLO https://raw.githubusercontent.com/saiabhiramjaini/green-branch/main/deploy/phone/setup.sh
less setup.sh          # read it first
bash setup.sh
```

The setup takes a while. It installs Debian, Node.js, Python dependencies, Redis, PM2 and
cloudflared, then asks for:

- **GitHub owners allowed:** defaults to `saiabhiramjaini`.
- **Groq API key**
- **Cloudflare Tunnel token:** press Enter to skip for now. Step 3 covers it.

At the end it prints `AGENT_SERVER_API_KEY` and `RUNNER_API_KEY` for Vercel (step 4).
Then set an SSH password with `passwd`, and check both backends:

```bash
curl localhost:8000/api/v1/health
curl localhost:8001/api/v1/health/executor     # should show "executor":"local" and the tools
```

Re-running `setup.sh` is safe. It keeps existing `.env` files and the tunnel token.

## 3. Cloudflare Tunnel

1. **Zero Trust → Networks → Tunnels → Create a tunnel**, type **Cloudflared**. Copy the
   token (it starts with `eyJ…`).
2. Save the token on the phone and restart. In Termux:

   ```bash
   proot-distro login debian -- bash -c 'read -rsp "Token: " T && echo && (umask 077; printf "%s\n" "$T" > /root/.greenbranch/tunnel-token)'
   sh ~/.termux/boot/greenbranch
   ```

   The dashboard should show the tunnel as connected within a few seconds.
3. Add routes to the tunnel (**Routes → Add route → Published application**). The hostnames
   are examples:

   | Hostname | Service URL |
   |---|---|
   | `greenbranch-api.example.com` | `http://localhost:8000` |
   | `greenbranch-runner.example.com` | `http://localhost:8001` |
   | `greenbranch-ssh.example.com` | `ssh://localhost:8022` |

4. Protect the SSH hostname **before** you rely on it:
   - **Zero Trust → Access → Service credentials → Create Service Token.** Name it
     `github-actions-deploy`, make it non-expiring, and copy the Client ID and Secret.
   - **Access → Applications → Self-hosted:** hostname `greenbranch-ssh.example.com`, and a
     policy with action **Service Auth** that includes that service token.
   - Check it: `curl -s -o /dev/null -w "%{http_code}\n" https://greenbranch-ssh.example.com/`
     must print `403`.

## 4. Point Vercel at the phone

In the Vercel project's environment variables (Production), then redeploy:

| Variable | Value |
|---|---|
| `AGENT_SERVER_URL` | `https://greenbranch-api.example.com` |
| `AGENT_SERVER_API_KEY` | printed by the setup |
| `RUNNER_URL` | `https://greenbranch-runner.example.com` |
| `RUNNER_API_KEY` | printed by the setup |
| `NEXT_PUBLIC_SERVER_WS_URL` | `wss://greenbranch-api.example.com/api/v1` |

To see the keys again, run this in Termux:
`proot-distro login debian -- grep -h API_KEY /root/green-branch/server-ai/.env /root/green-branch/server-runner/.env`

## 5. Deploy on every push (GitHub Actions)

`.github/workflows/phone-deploy.yaml` runs when `server-ai/`, `server-runner/` or
`deploy/phone/` change on `main`. It installs and imports both apps, then runs
`deploy.sh` on the phone. `deploy.sh` fast-forwards, syncs dependencies, restarts both
backends, waits for `/health`, and rolls back if they aren't healthy.

**Deploy key.** Create it on your laptop:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/greenbranch_deploy -N "" -C github-actions-deploy
cat ~/.ssh/greenbranch_deploy.pub
```

Add the public key on the phone (Termux):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'PASTE_THE_PUBLIC_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
whoami                                                    # → PHONE_SSH_USER
echo "greenbranch-ssh.example.com $(cut -d' ' -f1,2 "$PREFIX/etc/ssh/ssh_host_ed25519_key.pub")"   # → PHONE_SSH_KNOWN_HOSTS
```

**Secrets.** Set them from your laptop with your personal GitHub account:

```bash
export GH_TOKEN=$(gh auth token --user saiabhiramjaini) R=saiabhiramjaini/green-branch
gh secret set PHONE_SSH_HOST --repo $R --body "greenbranch-ssh.example.com"
gh secret set PHONE_SSH_USER --repo $R --body "u0_aXXX"
gh secret set PHONE_SSH_KEY --repo $R < ~/.ssh/greenbranch_deploy
gh secret set PHONE_SSH_KNOWN_HOSTS --repo $R --body "greenbranch-ssh.example.com ssh-ed25519 AAAA..."
gh secret set CF_ACCESS_CLIENT_ID --repo $R --body "xxxxxxxx.access"
gh secret set CF_ACCESS_CLIENT_SECRET --repo $R      # prompts, input hidden
unset GH_TOKEN
```

The old AWS secrets (`DOCKERHUB_*`, `AGENT_EC2_*`, `SERVER_EC2_*`, `EC2_AGENT_*`,
`SERVER_GROQ_API_KEY`, `SERVER_API_KEY`) are no longer used and can be deleted.

To deploy by hand, use **Actions → Deploy backends to phone → Run workflow**. Or run this
from Termux on the phone:

```bash
proot-distro login debian -- bash -c 'cd /root/green-branch && git fetch -q origin main && bash deploy/phone/deploy.sh "$(git rev-parse origin/main)"'
```

## Day to day

Run these in Termux. PM2 commands run inside Debian:

```bash
proot-distro login debian -- pm2 list
proot-distro login debian -- pm2 logs server-ai --lines 100
proot-distro login debian -- pm2 restart server-runner
sh ~/.termux/boot/greenbranch          # start everything (also what runs at boot)
```

If PM2 isn't running (for example `pm2 list` hangs, or a deploy says so), start it with
`start.sh` (`sh ~/.termux/boot/greenbranch`) rather than with a `pm2` command.
`start.sh` restarts the tunnel too, so run it from the phone or over Wi-Fi, not through
the tunnel.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy fails: `websocket: bad handshake` | Check the Access application, its Service Auth policy, and the `CF_ACCESS_*` secrets |
| Deploy fails: `Host key verification failed` | Re-create `PHONE_SSH_KNOWN_HOSTS` (step 5) |
| Deploy fails: `Connection closed` / timeout | Phone off, Wi-Fi down, or `cloudflared`/`sshd` not running. Run `start.sh` |
| Deploy fails: `PM2 isn't running` | Run `sh ~/.termux/boot/greenbranch` on the phone |
| Deploy fails: `cannot fast-forward` | Something was committed or edited on the phone. Check `git status` in `/root/green-branch` |
| Deploy fails: health check | The workflow log shows the last app logs, and the old version is already restored |
| Dashboard: "only works on repositories owned by…" | Add the owner to `RUNNER_ALLOWED_REPO_OWNERS` in `/root/green-branch/server-runner/.env`, then `pm2 restart server-runner` |
| Tests time out | Raise `RUNNER_INSTALL_TIMEOUT` / `RUNNER_TEST_TIMEOUT` in `server-runner/.env` |
| Everything stops when the screen is off | Battery settings in step 1, and the Android 12+ child-process setting |
