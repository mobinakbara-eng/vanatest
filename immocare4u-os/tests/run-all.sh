#!/usr/bin/env bash
# Runs all automated tests against a throw-away local PostgreSQL.
# Needs: node >= 18, PostgreSQL server binaries (initdb/pg_ctl) and psql.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d /var/tmp/icpg.XXXX)"
PORT="${PGPORT_TEST:-5499}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then RUNAS="su postgres -c"; chown postgres "$TMP"; fi
run() { if [ -n "$RUNAS" ]; then $RUNAS "$*"; else bash -c "$*"; fi; }

cleanup() { run "$PGBIN/pg_ctl -D $TMP/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
run "$PGBIN/pg_ctl -D $TMP/data -o '-p $PORT -k $TMP -c listen_addresses=' -l $TMP/log -w start" >/dev/null
URL="postgresql://postgres@/postgres?host=$TMP&port=$PORT"

echo "== migration + seed"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/db/migrations/001_foundation.sql"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/db/migrations/002_approval_channels.sql"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/db/seeds/001_test_property.sql"

echo "== DB guard rails"
psql "$URL" -v ON_ERROR_STOP=1 -qt -f "$ROOT/tests/db_guardrails_test.sql" 2>&1 | grep -E 'PASS|FAIL|passed'

echo "== workflows build"
node "$ROOT/n8n/build-workflows.js"
git -C "$ROOT" diff --quiet -- n8n/workflows || { echo "Generated workflows differ from committed files — commit the rebuild"; }

echo "== node tests (lib + WF-02 simulation)"
PG_TEST_URL="$URL" node --test "$ROOT"/tests/*.test.js
