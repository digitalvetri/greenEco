#!/bin/sh
set -e

echo "[entrypoint] applying pending Prisma migrations..."
npx prisma migrate deploy

# One-time production data load (client's vendor material catalog). Opt-in via env
# so this is inert on every other deploy/restart; never blocks startup if it fails.
# Remove this block + scripts/one-time-material-import.js once confirmed run.
if [ "$RUN_ONE_TIME_IMPORT" = "1" ]; then
  echo "[entrypoint] RUN_ONE_TIME_IMPORT=1 — running one-time material import..."
  node scripts/one-time-material-import.js || echo "[entrypoint] one-time import failed (non-fatal, continuing startup)"
fi

echo "[entrypoint] starting Next.js on port ${PORT:-3000}..."
exec node_modules/.bin/next start -p "${PORT:-3000}"
