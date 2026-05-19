#!/usr/bin/env bash
# Backup SQLite + volumes → OVH Object Storage S3-compat via restic.
# crontab: 0 4 * * * /usr/local/bin/backup.sh
set -euo pipefail

# Config — adapter avant 1er run
export RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-s3:s3.gra.io.cloud.ovh.net/<bucket>}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/root/.restic-pass}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-<ovh-s3-access>}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-<ovh-s3-secret>}"

STACK_DIR="/opt/stack"
DB_PATH="$STACK_DIR/data/tennis/poker.db"
SNAPSHOT_DIR="/tmp/sqlite-snap"

if ! command -v restic >/dev/null; then
  apt install -y restic
fi

# 1. SQLite hot backup (consistent même avec writes en cours)
mkdir -p "$SNAPSHOT_DIR"
sqlite3 "$DB_PATH" ".backup $SNAPSHOT_DIR/poker.db"

# 2. Init repo si premier run
restic snapshots >/dev/null 2>&1 || restic init

# 3. Backup
restic backup \
  --tag daily \
  "$SNAPSHOT_DIR/poker.db" \
  "$STACK_DIR/infra/compose"

# 4. Retention
restic forget --prune \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6

# 5. Cleanup
rm -rf "$SNAPSHOT_DIR"

echo "[$(date -Iseconds)] backup done"
