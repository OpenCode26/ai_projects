#!/usr/bin/env bash
# Build (if needed) and run the FinAlly container. Safe to run repeatedly.
#
# Usage: ./scripts/start_mac.sh [--build] [--no-open]
#   --build     force a rebuild even if the image already exists
#   --no-open   don't try to open a browser
set -euo pipefail

IMAGE_NAME="finally"
CONTAINER_NAME="finally"
PORT="${FINALLY_PORT:-8000}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

force_build=false
open_browser=true
for arg in "$@"; do
  case "$arg" in
    --build) force_build=true ;;
    --no-open) open_browser=false ;;
    -h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if command -v docker >/dev/null 2>&1; then
  ENGINE=docker
elif command -v podman >/dev/null 2>&1; then
  ENGINE=podman
else
  echo "Error: neither 'docker' nor 'podman' was found on PATH." >&2
  echo "Install Docker Desktop (https://docs.docker.com/get-docker/) and try again." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "No .env found — created one from .env.example."
  echo "Edit .env and set OPENROUTER_API_KEY before using the AI chat panel."
fi

mkdir -p db

# SELinux (Fedora/RHEL) blocks container writes to a bind mount unless the
# source is relabelled. Harmless/ignored on Docker Desktop for macOS.
mount_opt=""
if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled 2>/dev/null; then
  mount_opt=":z"
fi

if [ "$force_build" = true ] || ! "$ENGINE" image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "Building image '$IMAGE_NAME' with $ENGINE..."
  "$ENGINE" build -t "$IMAGE_NAME" .
fi

if "$ENGINE" container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Removing existing container '$CONTAINER_NAME'..."
  "$ENGINE" rm -f "$CONTAINER_NAME" >/dev/null
fi

"$ENGINE" run -d \
  --name "$CONTAINER_NAME" \
  -p "${PORT}:8000" \
  -v "${ROOT_DIR}/db:/app/db${mount_opt}" \
  --env-file .env \
  --restart unless-stopped \
  "$IMAGE_NAME" >/dev/null

URL="http://localhost:${PORT}"
# Polled over 127.0.0.1 rather than localhost: published ports bind IPv4 only,
# but localhost resolves to ::1 first on many hosts, which fails the probe even
# though the app is up.
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
printf "Waiting for FinAlly to come up"
for _ in $(seq 1 60); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo ""
    echo "FinAlly is running at ${URL}"
    if [ "$open_browser" = true ]; then
      if command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
      fi
    fi
    echo "Stop it with: ./scripts/stop_mac.sh"
    exit 0
  fi
  if ! "$ENGINE" container inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true; then
    echo ""
    echo "Container exited during startup. Logs:" >&2
    "$ENGINE" logs "$CONTAINER_NAME" >&2 || true
    exit 1
  fi
  printf "."
  sleep 1
done

echo ""
echo "Timed out waiting for ${HEALTH_URL}. Recent logs:" >&2
"$ENGINE" logs --tail 50 "$CONTAINER_NAME" >&2 || true
exit 1
