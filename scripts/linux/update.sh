#!/usr/bin/env bash
# Brings the app up to the latest version: a backup first, then stop, get the new version,
# install, update the database, build, and start again. Run from the app folder:
#   bash scripts/linux/update.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
cd "$APP_DIR"

if ! app_systemctl cat ap-it.service >/dev/null 2>&1; then
  echo "The app's service is not set up yet. Run bash scripts/linux/setup-rhel.sh first."
  exit 1
fi

failed() {
  echo
  echo "The update stopped: see the message above. The app is stopped."
  echo "Once the problem is fixed, run this again, or start the old version with the start command:"
  [ "$MODE" = system ] && echo "  sudo systemctl start ap-it" || echo "  systemctl --user start ap-it"
  exit 1
}

echo "Making a backup first..."
if ! npm run backup; then
  echo "The backup failed, so nothing was updated. The app is still running."
  exit 1
fi
app_systemctl stop ap-it.service
git pull --ff-only || failed
npm ci || failed
npm run db:migrate || failed
npm run build || failed
app_systemctl start ap-it.service
echo "Updated, and the app is starting again."
