# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the Next.js static export
# ---------------------------------------------------------------------------
FROM node:20-slim AS frontend

WORKDIR /build

COPY frontend/ ./

# Install, build, and discard node_modules plus the npm cache in a single layer.
# Only `out/` is copied forward, so anything left behind here is pure image
# weight — roughly a gigabyte of it.
RUN npm ci --no-audit --no-fund \
    && npm run build \
    && rm -rf node_modules /root/.npm


# ---------------------------------------------------------------------------
# Stage 2 — Python runtime (FastAPI serves the API and the static export)
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    FINALLY_DB_PATH=/app/db/finally.db \
    FINALLY_STATIC_DIR=/app/static

WORKDIR /app/backend

# Dependencies resolve from the lockfile alone (the backend sets
# `package = false`), so this layer caches across backend code edits.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ ./

COPY --from=frontend /build/out /app/static

RUN mkdir -p /app/db

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status == 200 else 1)"]

# Single worker is load-bearing (PLAN.md §13.1): the price cache and the market
# data background task are process-local, so extra workers would each get their
# own copy and serve divergent prices.
#
# `--workers` is omitted rather than set to 1. Passing it activates uvicorn's
# multiprocess supervisor, which forks the app into a child and then exits
# immediately when stdin is closed — as it is under `docker run -d`. Omitting
# the flag runs the server directly in this process, which is both stable
# detached and more literally single-process than `--workers 1`.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
