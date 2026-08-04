# Kanban MVP Plan

## Phase 1: Scaffolding

**Goal:** Project structure, tooling, and color theme in place.

- [x] Next.js app in `frontend/` (App Router, TypeScript, Tailwind)
- [x] Root `.gitignore` covering Node, Next.js, Playwright, OS files
- [x] Brand colors configured in Tailwind theme
- [x] Minimal README with run instructions

**Success criteria:** `npm run dev` starts without errors; blank page loads.

## Phase 2: Data Model & Dummy Data

**Goal:** In-memory board state with seed data.

- [x] Types: `Board`, `Column`, `Card` (id, title, details)
- [x] Fixed 5 columns with default names
- [x] Dummy cards distributed across columns
- [x] Pure reducer/helpers for add, delete, move, rename column

**Success criteria:** Unit tests pass for all state mutations.

## Phase 3: UI Components

**Goal:** Professional Kanban layout matching color scheme.

- [x] Board header with board title
- [x] 5 column components with editable titles
- [x] Card component (title + details)
- [x] Add-card form per column
- [x] Delete button on each card
- [x] Responsive horizontal scroll for columns

**Success criteria:** App renders dummy data; add/delete/rename work via UI.

## Phase 4: Drag and Drop

**Goal:** Move cards between columns and reorder within columns.

- [x] `@dnd-kit` integration
- [x] Drag overlay and drop indicators
- [x] State updates on drop

**Success criteria:** Cards move between any columns; order persists in session.

## Phase 5: Unit Testing

**Goal:** Rigorous tests for business logic.

- [x] Vitest configured
- [x] Tests for reducer: add card, delete card, move card, rename column
- [x] Tests for dummy data shape

**Success criteria:** `npm test` passes with full coverage of board logic.

## Phase 6: Integration Testing

**Goal:** End-to-end verification with Playwright.

- [x] Playwright configured
- [x] Test: dummy data visible on load
- [x] Test: add and delete card
- [x] Test: rename column
- [x] Test: drag card to another column

**Success criteria:** `npm run test:e2e` passes.

## Phase 7: Polish & Delivery

**Goal:** Production-ready MVP running locally.

- [x] Visual polish (shadows, spacing, hover states, accent lines)
- [x] No console errors
- [x] Dev server running for user

**Success criteria:** MVP complete, tested, server ready.
