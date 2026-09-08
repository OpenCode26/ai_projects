#!/usr/bin/env bash
# Stop and remove the FinAlly container. The db/ bind mount is left alone, so
# the portfolio persists. Safe to run repeatedly.
#
# Usage: ./scripts/stop_mac.sh
set -euo pipefail

CONTAINER_NAME="finally"

if command -v docker >/dev/null 2>&1; then
  ENGINE=docker
elif command -v podman >/dev/null 2>&1; then
  ENGINE=podman
else
  echo "Error: neither 'docker' nor 'podman' was found on PATH." >&2
  exit 1
fi

if "$ENGINE" container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  "$ENGINE" rm -f "$CONTAINER_NAME" >/dev/null
  echo "Stopped and removed container '$CONTAINER_NAME'. Your data in db/ is untouched."
else
  echo "No container named '$CONTAINER_NAME' is running. Nothing to do."
fi
