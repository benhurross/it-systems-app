#!/usr/bin/env bash
# Sets the app up to keep running on RHEL (and other Linux with systemd):
#   - it starts at boot, with nobody logged in, and starts again 10 seconds after it stops;
#   - the database starts with it;
#   - a backup is made every day (12:30, or BACKUP_TIME="18:00" before the command);
#   - port 3200 is opened in the firewall.
# Run it once, from the app folder, as the user who runs the app (it asks for sudo):
#   bash scripts/linux/setup-rhel.sh
# Running it again is safe: it brings everything back to this setup.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
cd "$APP_DIR"

BACKUP_TIME="${BACKUP_TIME:-12:30}"
NPM="$(command -v npm || true)"
NODE="$(command -v node || true)"
DOCKER="$(command -v docker || true)"
if [ -z "$NPM" ] || [ -z "$NODE" ]; then
  echo "npm was not found. Install Node.js 22 or 24 first: sudo dnf module install nodejs:22"
  exit 1
fi
if [ -z "$DOCKER" ] || [ "$MODE" = none ]; then
  echo "Docker was not found, or its service is not installed. Install Docker first (see docs/RHEL-SETUP.md)."
  exit 1
fi
if [ ! -f .env.local ]; then
  echo "There is no .env.local here yet. Set the app up first (README, First install), then run this again."
  exit 1
fi
if [ ! -d .next ]; then
  echo "Building the app first..."
  "$NPM" run build
fi

echo "Docker runs as: $([ "$MODE" = system ] && echo "a system service" || echo "this user ($APP_USER)")"

# ---------------------------------------------------------------- Docker at boot
if [ "$MODE" = system ]; then
  sudo systemctl enable --now docker.service
  # The app's user runs docker without sudo.
  if ! id -nG "$APP_USER" | grep -qw docker; then
    sudo usermod -aG docker "$APP_USER"
    echo "Added $APP_USER to the docker group."
  fi
  UNIT_DIR="$UNIT_DIR_SYSTEM"
  AFTER="After=network-online.target docker.service"
  WANTS="Wants=network-online.target"
  REQUIRES="Requires=docker.service"
  WANTED_BY="multi-user.target"
  USER_LINE="User=$APP_USER"
else
  # This user's services run from boot, whether or not anyone logs in ("lingering").
  sudo loginctl enable-linger "$APP_USER"
  if systemctl --user cat docker.service >/dev/null 2>&1; then
    systemctl --user enable --now docker.service
  else
    systemctl --user enable --now podman.socket
  fi
  UNIT_DIR="$UNIT_DIR_USER"
  # A user's services start once the system is up; they cannot wait on its targets.
  AFTER="-"
  WANTS="-"
  REQUIRES="-"
  WANTED_BY="default.target"
  USER_LINE="-"
fi

# ---------------------------------------------------------------- the services
# Services start with a short PATH: they are given the folders node and docker are in, which
# may be elsewhere (Node.js installed with nvm, for one).
SEARCH_PATH="$(dirname "$NODE"):$(dirname "$DOCKER"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"

# Writes a unit file, leaving out the lines that are just "-".
write_unit() {
  local name="$1" content
  content="$(printf '%s\n' "$2" | grep -vx -- '-')"
  if [ "$MODE" = system ]; then
    printf '%s\n' "$content" | sudo tee "$UNIT_DIR/$name" >/dev/null
  else
    mkdir -p "$UNIT_DIR"
    printf '%s\n' "$content" >"$UNIT_DIR/$name"
  fi
}

write_unit ap-it.service "[Unit]
Description=AP IT System
$AFTER
$WANTS
$REQUIRES

[Service]
Type=simple
$USER_LINE
WorkingDirectory=$APP_DIR
Environment=PATH=$SEARCH_PATH
# The database first, waiting until it is ready.
ExecStartPre=$DOCKER compose up -d --wait
ExecStart=$NPM start
Restart=always
RestartSec=10

[Install]
WantedBy=$WANTED_BY"

write_unit ap-it-backup.service "[Unit]
Description=AP IT System backup
$AFTER

[Service]
Type=oneshot
$USER_LINE
WorkingDirectory=$APP_DIR
Environment=PATH=$SEARCH_PATH
ExecStart=$NPM run backup"

write_unit ap-it-backup.timer "[Unit]
Description=AP IT System backup, every day

[Timer]
OnCalendar=*-*-* $BACKUP_TIME:00
# A backup missed while the computer was off is made once it is on again.
Persistent=true

[Install]
WantedBy=timers.target"

# A copy started by hand in a terminal would hold port 3200.
pkill -u "$APP_USER" -f "next start" 2>/dev/null || true
sleep 1

app_systemctl daemon-reload
app_systemctl enable ap-it.service ap-it-backup.timer
app_systemctl restart ap-it.service
app_systemctl start ap-it-backup.timer

# ---------------------------------------------------------------- firewall
if command -v firewall-cmd >/dev/null 2>&1 && sudo firewall-cmd --state >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-port=3200/tcp >/dev/null
  sudo firewall-cmd --reload >/dev/null
  echo "Port 3200 is open in the firewall."
fi

# ---------------------------------------------------------------- check
echo "Waiting for the app to start..."
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null "http://localhost:3200/en/sign-in"; then
    echo
    echo "The app is running, and will start by itself after every reboot."
    break
  fi
  sleep 2
done
if ! curl -fs -o /dev/null "http://localhost:3200/en/sign-in"; then
  echo
  echo "The app did not answer yet. See what it says with:"
  [ "$MODE" = system ] && echo "  journalctl -u ap-it -n 50" || echo "  journalctl --user -u ap-it -n 50"
  if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = Enforcing ]; then
    echo "SELinux is on: if it blocked something, this shows it: sudo ausearch -m avc -ts recent"
  fi
fi

S=$([ "$MODE" = system ] && echo "sudo systemctl" || echo "systemctl --user")
J=$([ "$MODE" = system ] && echo "journalctl -u" || echo "journalctl --user -u")
cat <<EOF

To...                     Run
  stop the app            $S stop ap-it
  start it again          $S start ap-it
  see if it is running    $S status ap-it
  see what it is doing    $J ap-it -f
  see the backups' runs   $J ap-it-backup
  update to a new version bash scripts/linux/update.sh
EOF
