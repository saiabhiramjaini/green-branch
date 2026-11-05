#!/data/data/com.termux/files/usr/bin/sh
# Starts GreenBranch on the phone. Runs in Termux (not Debian).
#
# setup.sh links this file as the Termux:Boot script (~/.termux/boot/greenbranch),
# so everything comes back after a reboot. You can also run it by hand; note that
# it restarts the tunnel, so run it from the phone's Wi-Fi, not over the tunnel.

# Keep Android from suspending Termux while the screen is off
termux-wake-lock

pgrep -x sshd >/dev/null || sshd

# proot keeps running for as long as PM2 does, so start it in the background
nohup proot-distro login debian -- bash -lc \
  'pm2 startOrReload /root/green-branch/deploy/phone/ecosystem.config.js && pm2 save' \
  >"$HOME/greenbranch-start.log" 2>&1 &

echo "GreenBranch starting — log: ~/greenbranch-start.log"
