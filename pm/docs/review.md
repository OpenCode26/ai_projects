# Code Review

Reviewed: Parts 2–7 (full codebase). Findings ranked most-severe first.

---

## 1. SQLite data is lost on every container restart

**File:** `docker-compose.yml` / `backend/database.py:4`
**Severity:** Critical

`kanban.db` is written inside the container filesystem at `/app/kanban.db`. No Docker volume is declared anywhere in `docker-compose.yml`. Every `docker compose up --build` or container restart destroys all data and re-seeds an empty board.

**Fix:** Add a named volume in `docker-compose.yml` and mount it at `/app`:
```yaml
services:
  app:
    volumes:
      - kanban_data:/app
volumes:
  kanban_data:
```

---

## 2. Race condition produces duplicate card positions

**File:** `backend/board.py:94`
**Severity:** High

`create_card` computes the next position with a `SELECT MAX(position) + 1` and then does a separate `INSERT`. Two concurrent POST `/api/cards` requests to the same column both read `MAX=2`, both compute `position=3`, and both insert — leaving two cards at position 3. `GET /api/board` then returns them in non-deterministic order.

**Fix:** Use `INSERT` with a subquery to compute position atomically, or acquire a table-level lock around the read-modify-write. For SQLite at MVP scale, wrapping in `BEGIN IMMEDIATE` is simplest.

---

## 3. Stale closure in `handleDragEnd` corrupts board state

**File:** `frontend/src/components/KanbanBoard.tsx:62–65`
**Severity:** High

`handleDragEnd` reads `board.columns` from the closure captured at render time, not from the latest state. If `handleAddCard` resolves (calling `setBoard`) between drag-start and drag-end, `computeMove` runs on the stale snapshot and the subsequent `setBoard` overwrites the just-added card's entry in `cardIds`, silently removing it from its column.

**Fix:** Move the `computeMove` call inside a functional updater:
```ts
setBoard((prev) => {
  const newColumns = computeMove(prev.columns, activeId, overId);
  // fire API call here with newColumns
  return { ...prev, columns: newColumns };
});
```

---

## 4. `ids.remove()` raises `ValueError` and returns an unhandled 500

**File:** `backend/board.py:169`
**Severity:** High

In the same-column move path, `ids.remove(card_id)` raises `ValueError` if `card_id` is not present in `_column_card_ids`. This can happen if a previous failed move left the card's `column_id` in the database inconsistent with what the client believes. FastAPI catches the unhandled exception and returns a generic 500 with no useful message.

**Fix:** Guard with an explicit check and raise `HTTPException(404)` if the card is not found in the column, or wrap in a `try/except ValueError`.

---

## 5. Optimistic card delete has no rollback on API failure

**File:** `frontend/src/components/KanbanBoard.tsx:89–100`
**Severity:** Medium

`handleDeleteCard` removes the card from local state immediately, then fires the API call with `.catch(console.error)`. If the server returns an error (network down, 500), the card is permanently gone from the UI but still exists in the database. On next page reload it reappears, which is confusing. The user sees no error message.

**Fix:** Either reload the board on failure, or move to a pessimistic model (await the API, then update state).

---

## 6. Unchecked `undefined` in card lookup crashes child components

**File:** `frontend/src/components/KanbanBoard.tsx:187`
**Severity:** Medium

```ts
cards={column.cardIds.map((cardId) => board.cards[cardId])}
```

If `board.cards[cardId]` is `undefined` (malformed API response, partial failure), the `undefined` is passed directly into `KanbanColumn` → `KanbanCard`, which will throw when accessing `card.title` or `card.id`, crashing the entire board.

**Fix:** Filter out missing cards: `.map((id) => board.cards[id]).filter(Boolean)`.

---

## 7. `rename_column` response body returns an empty `cards` list

**File:** `backend/board.py:85`
**Severity:** Medium

`PATCH /api/columns/{id}` returns `ColumnOut(... cards=[])`. Any consumer that reads the response body to update its local state (e.g. a future AI agent, or a frontend refactor) will incorrectly clear the column's card list. The frontend currently ignores this response body and uses optimistic state, which masks the bug today.

**Fix:** Either return only the changed fields (drop `cards` from the rename response model), or fetch and include the real cards before returning.

---

## 8. `fetchBoard` error is silently swallowed; board shows blank

**File:** `frontend/src/components/KanbanBoard.tsx:46`
**Severity:** Medium

```ts
.catch(() => setLoading(false));
```

If the API call fails (server down, 401, network error), `loading` is set to `false` and `board` stays `{ columns: [], cards: {} }`. The user sees an empty board with no error message and no way to know something went wrong.

**Fix:** Add an `error` state and render a user-visible message when the board fails to load.

---

## 9. Backend API has no authentication middleware

**File:** `backend/board.py` (all routes) / `backend/main.py`
**Severity:** Medium (known MVP gap)

All API routes (`GET /api/board`, `PATCH /api/columns/…`, `POST /api/cards`, etc.) are fully open — no session cookie, no token, no check of any kind. The frontend auth is pure client-side (localStorage flag + hardcoded credential comparison in the JS bundle). Any script that can reach port 8000 has full read/write access to the board.

This is a documented MVP limitation ("hardcoded to 'user' and 'password'"), but should be closed before any non-local deployment. The database already has a `users` table and `boards.user_id` FK ready for a proper session layer.

---

## 10. `useMemo` aliases `board.cards` with no transformation

**File:** `frontend/src/components/KanbanBoard.tsx:49`
**Severity:** Low (cleanup)

```ts
const cardsById = useMemo(() => board.cards, [board.cards]);
```

`useMemo` returns the exact same object reference with no computation. It adds a layer of indirection for zero benefit and conflicts with the project's "keep it simple, no over-engineering" standard.

**Fix:** Delete the `useMemo` and reference `board.cards` directly where `cardsById` is used (line 113).
