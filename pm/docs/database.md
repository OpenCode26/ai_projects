# Database Approach

## Engine

SQLite via Python's built-in `sqlite3` module. The database file is `kanban.db` at the project root (mounted as a Docker volume so data persists across container restarts).

## Schema

Four tables. Full column definitions are in `docs/schema.json`.

### users
Stores credentials. The MVP has one hardcoded user (`user` / `password`), but the table supports multiple users for future.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| username | TEXT | Unique |
| password_hash | TEXT | bcrypt hash; seeded on first run |

### boards
One board per user. Exists as a separate table so adding multiple boards per user later is a schema-free change.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| user_id | INTEGER | FK → users(id) |

### columns
The five Kanban columns. `position` controls display order.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| board_id | INTEGER | FK → boards(id) |
| title | TEXT | User-editable |
| position | INTEGER | 0-based display order |

### cards

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| column_id | INTEGER | FK → columns(id) |
| title | TEXT | |
| details | TEXT | Defaults to `''` |
| position | INTEGER | 0-based order within column |

## Key decisions

**Card ordering via `position` integer.** When a card moves, the backend recalculates and writes the positions of affected cards in a single transaction. Simple and sufficient at MVP scale.

**No timestamps.** Added only if a feature requires them (e.g. audit log, AI context). Not needed for MVP.

**Seed on first run.** If the database file does not exist, the backend creates it, runs `CREATE TABLE IF NOT EXISTS` for all tables, and inserts the one user + one board + five default columns. Subsequent restarts are no-ops.

**Foreign keys enforced.** `PRAGMA foreign_keys = ON` is set on every connection.
