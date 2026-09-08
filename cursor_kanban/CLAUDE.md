# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

All commands run from `frontend/` (the Next.js app lives in that subdirectory, not the repo root).

```bash
cd frontend
npm install

npm run dev          # dev server at http://localhost:3000
npm run build        # production build
npm run lint         # eslint

npm run test         # vitest unit tests (single run)
npm run test:watch   # vitest watch mode
npx tsc --noEmit     # typecheck (no dedicated script)

npm run test:e2e     # playwright e2e (auto-starts dev server via webServer config)
npx playwright install chromium   # one-time browser install if e2e fails with "Executable doesn't exist"
```

Run a single test:

```bash
npx vitest run lib/board-actions.test.ts -t "moves a card between columns"
npx playwright test e2e/kanban.spec.ts -g "drags a card to another column"
```

## Architecture

Single-page client app, no backend, no persistence — all board state lives in one
`useReducer` in `KanbanBoard` and resets on page refresh (by design, per `AGENTS.md`).

- `lib/types.ts` — `Board` / `Column` / `Card` / `BoardAction` types.
- `lib/dummy-data.ts` — the seed `dummyBoard` the app boots with (5 fixed columns).
- `lib/board-actions.ts` — `boardReducer`, the only place board state is mutated
  (`ADD_CARD`, `DELETE_CARD`, `RENAME_COLUMN`, `MOVE_CARD`), plus `findCardColumn`
  helper. Pure functions, fully unit-tested in `board-actions.test.ts` — this is
  where new board logic belongs, not in components.
- `components/KanbanBoard.tsx` — owns the `useReducer` state and the single
  `DndContext`. Registers `PointerSensor` (6px activation distance, so clicks on
  buttons inside a card don't start a drag) and `KeyboardSensor`. Translates
  dnd-kit's `onDragOver`/`onDragEnd` events into `MOVE_CARD` actions — `onDragOver`
  handles both cross-column moves and same-column live reordering (guarded against
  redundant dispatches when the index hasn't actually changed).
- `components/KanbanColumn.tsx` — one per column; wraps its cards in
  `useDroppable` + `SortableContext`. The rename `<input>` uses local draft state
  and only commits via `onRename` on blur, reverting to the previous title if left
  empty (not committed on every keystroke).
- `components/KanbanCard.tsx` — `useSortable`; the entire card (not a separate
  grip icon) is the drag handle, distinguished from clicks by the sensor's
  activation-distance constraint. Role is explicitly `"group"` (not the
  `role="button"` dnd-kit defaults to) since it wraps a real `<button>` (Delete).
- `components/KanbanCardPreview.tsx` — the visual shown in `DragOverlay` while
  dragging; kept as a separate component from `KanbanCard` since it doesn't need
  sortable wiring.
- `components/AddCardForm.tsx` — uncontrolled form (reads via
  `form.elements.namedItem`), calls `form.reset()` after submit.

Brand colors are wired as Tailwind v4 theme tokens in `app/globals.css`
(`@theme inline`: `--color-accent`, `--color-primary`, `--color-secondary`,
`--color-navy`, `--color-muted`) — use the `accent`/`primary`/`secondary`/`navy`/`muted`
utility classes rather than hardcoding hex values.
