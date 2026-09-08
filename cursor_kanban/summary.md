# Project Summary

## What this is

A Kanban MVP built with Next.js (App Router, TypeScript, Tailwind), per the
requirements in `AGENTS.md`: one board, 5 renameable columns, cards with a
title and details, add/delete cards, drag-and-drop between columns, no
persistence, seeded with dummy data on load.

## What was done

**Built and verified the MVP.** Most of the app (`frontend/`) was already
scaffolded from a prior session — reducer-based state, all UI components,
dnd-kit drag-and-drop, Vitest unit tests, Playwright e2e tests — but
`PLAN.md` still showed every phase unchecked. Ran the full verification
suite (unit tests, typecheck, lint, production build) and found one real
bug via the e2e suite: the drag handle was a tiny icon instead of the whole
card, so dragging from the card body (what a real user would do) silently
did nothing. Fixed it by making the whole card the drag target. Updated
`PLAN.md` to check off all completed phases.

**Code review.** Reviewed the app against the "slick, professional,
gorgeous UI/UX" bar from `AGENTS.md` and wrote 5 findings to `improve.md`:

1. Same-column drags had no live reorder preview (only cross-column did)
2. Cards advertised keyboard drag support via ARIA that didn't actually work (no `KeyboardSensor` registered)
3. Nested interactive ARIA roles (a real `<button>` inside an element with `role="button"`)
4. Submitting an empty card title failed silently with no feedback
5. Clearing a column title and clicking away left it permanently blank

**Implemented the fixes.** Delegated implementation to a Haiku subagent with
the exact code changes for all 5 issues, then independently verified the
result — read the actual diffs (not just the agent's report) and reran
unit tests, typecheck, lint, and the full Playwright suite myself. All
passed: 7 unit tests, 4 e2e tests, clean lint/typecheck.

**Added `CLAUDE.md`.** Root-level guidance file for future Claude Code
sessions: commands (dev/build/lint/test/e2e, including how to run a single
test), and the architecture (reducer owns all state in `board-actions.ts`,
how `KanbanBoard` wires dnd-kit sensors into `MOVE_CARD` actions, the
commit-on-blur rename pattern, why the card role is `"group"`). It imports
`AGENTS.md` for the business requirements and color spec rather than
duplicating them.

## Current state

- Dev server running at http://localhost:3000
- All tests passing (7 unit, 4 e2e), clean lint and typecheck
- Key files: `AGENTS.md` (requirements), `PLAN.md` (phased build plan, all
  checked off), `improve.md` (code review findings, all fixed),
  `CLAUDE.md` (guidance for future Claude Code sessions)
