# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Just Vibe — a single-board Kanban app with planned AI chat sidebar, runs in Docker. See `docs/PLAN.md` for the phased build plan and `AGENTS.md` for business requirements and technical decisions.

Current state: full-stack app with SQLite persistence. Frontend built statically, served by FastAPI. Auth is client-side only. AI sidebar not yet implemented.

## Architecture

- **Frontend** (`frontend/`): Next.js 16, React 19, TypeScript, Tailwind CSS v4. Built statically (`npm run build` → `out/`) and served by the FastAPI backend at `/`.
- **Backend** (`backend/`): Python FastAPI. Serves the built frontend static files, provides REST API at `/api/*`, uses SQLite (`kanban.db`).
- **Scripts** (`scripts/`): Start/stop scripts for Mac, PC, Linux (wrap `docker-compose`).
- **Deployment**: Single Docker container. Python package manager is `uv`.

### ID type contract (important)

Frontend uses **string** IDs everywhere (`Column.id`, `Card.id`). Backend uses **integer** IDs. `frontend/src/lib/api.ts` bridges this: it calls `String(c.id)` when reading from the API and `Number(columnId)` when writing. Any new API integration must follow this pattern.

### Auth (MVP)

Login is validated entirely client-side in `LoginPage.tsx` (hardcoded `username === "user" && password === "password"`). Session is stored in `localStorage` as `authed: "true"`. There is no backend auth. The database schema has a `users` table for future expansion but it's pre-seeded with a single user.

### Frontend data model (`src/lib/kanban.ts`)

All board state is typed in `BoardData`:
```
BoardData = { columns: Column[], cards: Record<string, Card> }
Column = { id, title, cardIds[] }
Card = { id, title, details }
```

State lives in `KanbanBoard` (client component). `moveCard` handles all drag-and-drop column/position logic. Drag-and-drop uses `@dnd-kit/core`.

### Backend data flow

`database.py` owns schema creation and the `get_conn()` FastAPI dependency (auto-commits on success, rolls back on exception). `board.py` contains all `/api/*` route handlers. `main.py` wires up the router and mounts the `static/` directory.

Card positions are stored as integers and re-numbered from 0 after every delete or move (`_renumber_column`, `_write_positions` in `board.py`).

## Frontend Commands

```bash
cd frontend
npm install
npm run dev          # dev server at http://localhost:3000
npm run build        # production build (outputs to out/)
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests (run once)
npm run test:unit:watch  # Vitest in watch mode
npm run test:e2e     # Playwright e2e (auto-starts dev server)
npm run test:all     # unit + e2e
```

Run a single unit test file:
```bash
cd frontend && npx vitest run src/lib/kanban.test.ts
```

## Backend Commands

```bash
cd backend
uv sync --all-groups   # install all deps including dev
uv run pytest          # run tests
uv run uvicorn main:app --reload --port 8000  # local dev server
```

## Docker

```bash
docker compose up --build   # build and start (port 8000)
docker compose down         # stop
```

Or use `scripts/start.sh` / `scripts/stop.sh`. The Dockerfile does a multi-stage build: Node builds the frontend, Python image copies the `out/` as `static/`.

## Color Scheme (CSS variables)

| Token | Hex | Use |
|---|---|---|
| `--accent-yellow` | `#ecad0a` | accent lines, highlights |
| `--primary-blue` | `#209dd7` | links, key sections |
| `--purple-secondary` | `#753991` | submit buttons, important actions |
| `--navy-dark` | `#032147` | main headings |
| `--gray-text` | `#888888` | supporting text, labels |

## Coding Standards

- No emojis, ever.
- Keep it simple: no over-engineering, no unnecessary defensive programming, no extra features.
- Before fixing a bug, identify the root cause with evidence — do not guess.
- Use latest library versions and idiomatic approaches.
- AI calls (not yet implemented) will use OpenRouter with model `openai/gpt-oss-120b`. API key is `OPENROUTER_API_KEY` in `.env` at project root.
