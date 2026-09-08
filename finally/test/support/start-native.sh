#!/usr/bin/env bash
# Boot the full FinAlly stack natively (no container) for E2E runs.
#
# Docker is not available in every dev environment, but the app itself is just
# "Next.js static export served by FastAPI on one port" -- which reproduces
# faithfully without a container. Playwright launches this via `STACK=native`.
#
# Env knobs honoured by the backend (see backend/app/config.py):
#   FINALLY_STATIC_DIR              where FastAPI looks for the frontend export
#   FINALLY_DB_PATH                 SQLite file location
#   FINALLY_SNAPSHOT_INTERVAL_SECONDS   portfolio snapshot cadence
#   LLM_MOCK                        deterministic rule-based chat responses
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$TEST_DIR/.." && pwd)"

PORT="${PORT:-8000}"
STATIC_DIR="${FINALLY_STATIC_DIR:-$ROOT_DIR/frontend/out}"

# A fresh database per run, so "fresh start" specs really do see seed state
# ($10,000 cash, the ten default tickers, no positions) rather than leftovers
# from a previous run. Set FINALLY_DB_PATH yourself to opt out.
if [[ -z "${FINALLY_DB_PATH:-}" ]]; then
  DB_DIR="$TEST_DIR/.artifacts/db"
  rm -rf "$DB_DIR"
  mkdir -p "$DB_DIR"
  export FINALLY_DB_PATH="$DB_DIR/finally.db"
fi

# Deterministic chat, simulator-driven prices.
export LLM_MOCK="${LLM_MOCK:-true}"
export MASSIVE_API_KEY=""
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-test-key-not-used-in-mock-mode}"
export FINALLY_STATIC_DIR="$STATIC_DIR"

# REVIEW.md flags the 30s snapshot cadence as untestable in a reasonable run.
# Shortening it is the point of the interval being configurable at all.
export FINALLY_SNAPSHOT_INTERVAL_SECONDS="${FINALLY_SNAPSHOT_INTERVAL_SECONDS:-3}"

if [[ "${SKIP_FRONTEND_BUILD:-}" != "1" ]]; then
  echo "[start-native] building frontend static export -> $STATIC_DIR"
  cd "$ROOT_DIR/frontend"
  if [[ ! -d node_modules ]]; then
    npm ci --no-audit --no-fund
  fi
  npm run build
fi

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "[start-native] WARNING: $STATIC_DIR does not exist." >&2
  echo "[start-native] The frontend needs output:'export' in next.config.ts (PLAN §3)." >&2
  echo "[start-native] API specs will still run; UI specs will fail." >&2
fi

echo "[start-native] starting backend on :$PORT (db=$FINALLY_DB_PATH, LLM_MOCK=$LLM_MOCK)"
cd "$ROOT_DIR/backend"
# --workers 1 is mandatory: the price cache and market-data task are
# process-local, so extra workers would each get their own (PLAN §13.1).
exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$PORT" --workers 1
