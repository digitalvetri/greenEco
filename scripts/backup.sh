#!/usr/bin/env bash
#
# Nightly PostgreSQL backup for GreenEco CRM (Phase 1).
#
# Produces a compressed custom-format dump (pg_dump -Fc), which restores with
# pg_restore and supports selective/parallel restore. Rotates by retention days.
#
# Usage:
#   DATABASE_URL=postgres://…  BACKUP_DIR=/var/backups/greeneco  ./scripts/backup.sh
#
# Cron (2am daily), e.g. on the DB host or a Coolify scheduled task:
#   0 2 * * *  cd /app && DATABASE_URL=$DATABASE_URL ./scripts/backup.sh >> /var/log/greeneco-backup.log 2>&1
#
# Restore a dump:
#   pg_restore --clean --if-exists --no-owner -d "$TARGET_URL" <dumpfile>
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Prisma appends libpq-invalid params (?schema=public&connection_limit=…).
# pg_dump/psql use libpq, which errors on "schema". Strip the query string and
# honor a non-public schema via PGOPTIONS search_path instead.
SCHEMA="$(printf '%s' "$DATABASE_URL" | sed -nE 's/.*[?&]schema=([^&]+).*/\1/p')"
PG_URL="${DATABASE_URL%%\?*}"
if [ -n "$SCHEMA" ] && [ "$SCHEMA" != "public" ]; then
  export PGOPTIONS="-c search_path=$SCHEMA"
fi

mkdir -p "$BACKUP_DIR"

# Timestamp without external date-format surprises (UTC).
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/greeneco-$STAMP.dump"

echo "[backup] dumping to $OUT"
# -Fc custom format, --no-owner so it restores cleanly into any role.
pg_dump --dbname="$PG_URL" --format=custom --no-owner --file="$OUT"

SIZE="$(wc -c < "$OUT" | tr -d ' ')"
if [ "$SIZE" -lt 1000 ]; then
  echo "[backup] ERROR: dump is suspiciously small ($SIZE bytes)" >&2
  exit 1
fi
echo "[backup] wrote $SIZE bytes"

# Retention: delete dumps older than RETENTION_DAYS.
find "$BACKUP_DIR" -name 'greeneco-*.dump' -type f -mtime "+$RETENTION_DAYS" -print -delete \
  | sed 's/^/[backup] pruned /' || true

echo "[backup] done ($(ls -1 "$BACKUP_DIR"/greeneco-*.dump 2>/dev/null | wc -l | tr -d ' ') dumps retained)"
