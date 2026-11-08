#!/usr/bin/env bash
# Brings the app up to the latest version: a backup first, get the new version, then stop,
# install (when the packages changed), update the database, build, and start again. Run from
# the app folder:
#   bash scripts/linux/update.sh
set -euo pipefail

# All in one block, read whole before any of it runs: the update replaces this file as it goes.
{
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

  # Each step says how long it took, so a slow update shows where its time goes.
  step() {
    local started=$SECONDS
    echo
    echo "== $1"
    shift
    "$@" || return 1
    echo "   ($((SECONDS - started)) s)"
  }

  # The packages are installed afresh (npm ci, over a gigabyte) only when the list of them has
  # changed since the last install; most updates change only the app's own code.
  LOCK_STAMP=node_modules/.ap-it-installed-lock
  install_packages() {
    local want
    want="$(sha256sum package-lock.json | cut -d' ' -f1)"
    if [ -d node_modules ] && [ "$(cat "$LOCK_STAMP" 2>/dev/null)" = "$want" ]; then
      echo "   The packages have not changed: nothing to install."
      return 0
    fi
    npm ci --no-audit --no-fund || return 1
    echo "$want" >"$LOCK_STAMP"
  }

  started=$SECONDS
  if ! step "Making a backup first" npm run backup; then
    echo "The backup failed, so nothing was updated. The app is still running."
    exit 1
  fi
  # The new version is fetched while the app still runs: it keeps serving what was built before.
  step "Getting the new version" git pull --ff-only || {
    echo "Getting the new version failed, so nothing was updated. The app is still running."
    exit 1
  }
  step "Stopping the app" app_systemctl stop ap-it.service
  step "Installing packages" install_packages || failed
  step "Updating the database" npm run db:migrate || failed
  step "Building" npm run build || failed
  step "Starting the app" app_systemctl start ap-it.service
  echo
  echo "Updated, and the app is starting again. The update took $((SECONDS - started)) s."
  exit 0
}
