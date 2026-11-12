#!/usr/bin/env bash
# Backs up both Oryne databases. Run daily from cron (deploy/README.md, step 11):
#   15 3 * * * /opt/oryne/deploy/scripts/backup.sh
# Runs as the postgres user. Keeps 14 days here; copy them off the server too,
# because a backup on the same disk doesn't survive losing the server.
set -euo pipefail

DIR=/var/backups/oryne
KEEP_DAYS=14
STAMP=$(date -u +%Y%m%d-%H%M)

mkdir -p "$DIR"
for db in oryne_mainnet oryne_testnet; do
  pg_dump --format=custom --file="$DIR/$db-$STAMP.dump" "$db"
done
find "$DIR" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Backed up to $DIR at $STAMP"
