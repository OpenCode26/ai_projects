# Backend

Python FastAPI app (`main.py`). Serves the statically-built Next.js frontend from `./static/` (populated by the Docker multi-stage build) and exposes REST API routes under `/api/`.

## Structure

- `main.py` — FastAPI app; mounts `./static` at `/` if the directory exists
- `pyproject.toml` — deps managed with `uv`; prod deps + `[dependency-groups] dev`
- `tests/` — pytest tests; run with `uv run pytest`

## Key decisions

- Static files are served with `StaticFiles(html=True)` so `/` returns `index.html`.
- The `./static` mount is skipped if the directory is absent (local dev without a Docker build).
- `aiofiles` is a required runtime dep for Starlette's async static file serving.
- API routes must be defined before the static mount in `main.py` so FastAPI matches them first.
