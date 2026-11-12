#!/usr/bin/env bash
# Updates Oryne on this server to the latest master and restarts it, one
# service at a time, checking each one is healthy before the next.
#
#   sudo -u oryne /opt/oryne/deploy/scripts/deploy.sh
#
# Needs the sudoers rule in deploy/README.md (step 9) to restart the services.
set -euo pipefail

REPO=/opt/oryne
WEB_ROOT=/var/www/oryne

cd "$REPO"
echo "▸ Pulling master"
git fetch --quiet origin master
git merge --ff-only origin/master
echo "  now at $(git log -1 --format='%h %s')"

echo "▸ Installing dependencies"
npm ci --no-audit --no-fund

echo "▸ Building the website"
set -a
# shellcheck disable=SC1091
. /etc/oryne/web.env
set +a
npm run build
# Swap the finished build in; nginx never serves a half-written one.
rsync -a --delete apps/web/dist/ "$WEB_ROOT/"

healthy() {
  local url=$1
  for _ in $(seq 1 60); do
    if curl -fsS -m 5 -o /dev/null "$url"; then return 0; fi
    sleep 2
  done
  return 1
}

restart() {
  local unit=$1 url=$2
  # Only services that are switched on: restarting a disabled one would start
  # it, e.g. mainnet before its settings are filled in.
  if ! systemctl is-enabled --quiet "$unit"; then
    echo "▸ Skipping $unit (not enabled)"
    return 0
  fi
  echo "▸ Restarting $unit"
  sudo systemctl restart "$unit"
  if healthy "$url"; then
    echo "  ✓ $unit is up"
  else
    echo "  ✗ $unit did not come up. Last log lines:"
    sudo journalctl -u "$unit" -n 40 --no-pager
    exit 1
  fi
}

restart oryne-api-testnet http://127.0.0.1:8787/v1/info
restart oryne-demo-merchant http://127.0.0.1:8788/
restart oryne-api-mainnet http://127.0.0.1:8789/v1/info

echo "✓ Deployed $(git log -1 --format='%h')"
