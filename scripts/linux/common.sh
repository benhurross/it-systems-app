# Shared by the Linux scripts: where the app is, who runs it, and how its services are run.
# Sourced, not run.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="$(id -un)"
UNIT_DIR_SYSTEM=/etc/systemd/system
UNIT_DIR_USER="$HOME/.config/systemd/user"

if [ "$APP_USER" = root ]; then
  echo "Run this as the user who runs the app, not as root. It asks for sudo where it needs it."
  exit 1
fi

# Docker can run as a system service (the usual install), or as this user (rootless Docker, or
# Podman standing in for Docker). The app's services run the same way, so they can reach it.
if systemctl cat docker.service >/dev/null 2>&1; then
  MODE=system
elif systemctl --user cat docker.service >/dev/null 2>&1 || systemctl --user cat podman.socket >/dev/null 2>&1; then
  MODE=user
else
  MODE=none
fi

# systemctl for the app's own services, in the right place.
app_systemctl() {
  if [ "$MODE" = system ]; then sudo systemctl "$@"; else systemctl --user "$@"; fi
}
