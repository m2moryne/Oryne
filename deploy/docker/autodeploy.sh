#!/usr/bin/env bash
# Deploys the latest master when it changes. Run every minute by
# oryne-autodeploy.timer; safe to run by hand too:
#
#   sudo /opt/oryne/deploy/docker/autodeploy.sh          # only if master moved
#   sudo /opt/oryne/deploy/docker/autodeploy.sh --force  # rebuild and restart anyway
#
# Builds the images first: if the build fails, the running containers are left
# alone. Then recreates only the containers whose image changed and waits for
# each to report healthy. A commit that failed isn't retried every minute; the
# next push (or --force) tries again.
set -euo pipefail

REPO=${ORYNE_REPO:-/opt/oryne}
STATE=/var/lib/oryne-autodeploy
COMPOSE=(docker compose --project-directory "$REPO/deploy/docker" -f "$REPO/deploy/docker/compose.yml")

mkdir -p "$STATE"
# One deploy at a time: a slow build must not overlap the next timer tick.
exec 9>"$STATE/lock"
flock -n 9 || { echo "Another deploy is running"; exit 0; }

cd "$REPO"
git fetch --quiet origin master
target=$(git rev-parse origin/master)
deployed=$(cat "$STATE/deployed" 2>/dev/null || true)
failed=$(cat "$STATE/failed" 2>/dev/null || true)

if [[ ${1:-} != --force ]]; then
  [[ $target == "$deployed" ]] && exit 0
  [[ $target == "$failed" ]] && exit 0
fi

fail() {
  echo "✗ $1"
  echo "$target" > "$STATE/failed"
  exit 1
}

echo "▸ Deploying $(git log -1 --format='%h %s' "$target")"
# The server never has its own commits or edits (deploy/README.md, rule 5),
# so master is always a fast-forward. Settings live in gitignored files.
git merge --ff-only --quiet "$target" || fail "master can't be fast-forwarded: is the checkout edited?"

echo "▸ Building"
"${COMPOSE[@]}" build --pull || fail "build failed; the running containers were not touched"

echo "▸ Starting"
"${COMPOSE[@]}" up -d --remove-orphans || fail "docker compose up failed"

echo "▸ Waiting for health checks"
for _ in $(seq 1 60); do
  states=$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Health}}')
  if ! grep -qE ' (starting|unhealthy)$' <<<"$states"; then
    echo "$states" | sed 's/^/  /'
    echo "$target" > "$STATE/deployed"
    rm -f "$STATE/failed"
    docker image prune -f > /dev/null
    echo "✓ Deployed $(git log -1 --format='%h')"
    exit 0
  fi
  if grep -q ' unhealthy$' <<<"$states"; then break; fi
  sleep 5
done

echo "$states" | sed 's/^/  /'
for service in $(awk '$2 != "healthy" && $2 != "" {print $1}' <<<"$states"); do
  echo "── last log lines of $service"
  "${COMPOSE[@]}" logs --tail 40 "$service"
done
fail "not every service came up healthy"
