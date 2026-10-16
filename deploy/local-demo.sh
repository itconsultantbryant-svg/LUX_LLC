#!/usr/bin/env bash
#
# Bring up a clearly labelled, synthetic-only demo of HealthWallet Liberia on
# this machine, verify it end to end, and tear it down.
#
# It is repeatable and safe: it only ever touches a database whose name ends in
# `_demo`, and it refuses to run if the demo database name looks like a real one.
#
# Usage:
#   deploy/local-demo.sh            # set up, verify, tear down
#   deploy/local-demo.sh --keep     # set up, verify, then leave both servers running
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
DEMO_DB="healthwallet_demo"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-5173}"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

case "$DEMO_DB" in
  *_demo) : ;;
  *) echo "refusing: demo database must end in _demo (got $DEMO_DB)" >&2; exit 1 ;;
esac

echo "==> Reading the local development connection string"
if [ ! -f "$API_DIR/.env" ]; then
  echo "missing $API_DIR/.env (copy apps/api/.env.example and set DATABASE_URL)" >&2
  exit 1
fi
DEV_URL="$(grep -E '^DATABASE_URL=' "$API_DIR/.env" | tail -n1 | cut -d= -f2-)"
if [ -z "$DEV_URL" ]; then
  echo "could not read DATABASE_URL from apps/api/.env" >&2
  exit 1
fi
DEMO_URL="${DEV_URL%/*}/$DEMO_DB"
DEMO_URL_UNPOOLED="$DEMO_URL"

echo "==> Ensuring the demo database exists"
DB_ROLE="$(printf '%s' "$DEV_URL" | sed -E 's#^[^:]+://([^:]+):.*#\1#')"
if ! psql "$DEV_URL" -tAc "select 1 from pg_database where datname = '$DEMO_DB'" | grep -q 1; then
  # Prefer creating as the local superuser (trust auth on a dev machine) and
  # hand ownership to the application role so migrations can create tables.
  psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DEMO_DB\" OWNER \"$DB_ROLE\"" \
    || psql "$DEV_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DEMO_DB\""
fi

echo "==> Applying migrations to $DEMO_DB"
APP_ENV=demo DATABASE_URL="$DEMO_URL" DATABASE_URL_UNPOOLED="$DEMO_URL_UNPOOLED" \
  pnpm --filter @healthwallet/api db:migrate

echo "==> Seeding synthetic demo records"
APP_ENV=demo DATABASE_URL="$DEMO_URL" DATABASE_URL_UNPOOLED="$DEMO_URL_UNPOOLED" \
  pnpm --filter @healthwallet/api db:seed

echo "==> Building shared package and web app"
pnpm build:shared >/dev/null
pnpm --filter @healthwallet/web build >/dev/null

echo "==> Starting the API on :$API_PORT (APP_ENV=demo, sandbox adapters)"
APP_ENV=demo \
DATABASE_URL="$DEMO_URL" \
DATABASE_URL_UNPOOLED="$DEMO_URL_UNPOOLED" \
PORT="$API_PORT" HOST=127.0.0.1 \
CORS_ORIGIN="http://127.0.0.1:$WEB_PORT" \
  pnpm --filter @healthwallet/api dev >"$ROOT/.demo-api.log" 2>&1 &
API_PID=$!

echo "==> Starting the web app on :$WEB_PORT (proxying to the local API)"
NEON_FUNCTION_URL= ORIGIN_SECRET=demo-local-only-not-a-real-secret \
  pnpm --filter @healthwallet/web dev -- --port "$WEB_PORT" --host 127.0.0.1 \
  >"$ROOT/.demo-web.log" 2>&1 &
WEB_PID=$!

cleanup() {
  echo "==> Stopping demo servers"
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
}
if [ "$KEEP" -eq 0 ]; then trap cleanup EXIT; fi

echo "==> Waiting for the API to become ready"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$API_PORT/ready" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$API_PORT/ready" >/dev/null || {
  echo "API did not become ready; see .demo-api.log" >&2; cat "$ROOT/.demo-api.log" >&2; exit 1;
}

echo "==> Waiting for the web app"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Verifying the demo through the web origin (same path the Edge Middleware uses)"
node "$ROOT/deploy/verify-demo.mjs" "http://127.0.0.1:$WEB_PORT"

if [ "$KEEP" -eq 1 ]; then
  echo
  echo "Demo is running:"
  echo "  Web: http://127.0.0.1:$WEB_PORT"
  echo "  API: http://127.0.0.1:$API_PORT/health"
  echo "Press Ctrl+C to stop (both processes are children of this shell)."
  wait
fi
