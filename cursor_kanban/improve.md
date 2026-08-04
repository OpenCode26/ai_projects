# Code Review: Improvements

Review of `frontend/` (Kanban MVP). Scope: correctness, UX/accessibility issues that
contradict the "slick, professional, gorgeous UI/UX" requirement in `AGENTS.md`.
Lint, typecheck, build, and all automated tests pass — issues below are things
those tools cannot catch.

## 1. Same-column drag has no live reorder preview (cross-column does)

**File:** `frontend/components/KanbanBoard.tsx:34-68` (`handleDragOver`)

When dragging a card over a *different* column, `handleDragOver` dispatches
`MOVE_CARD` on every hover, so siblings visibly shift out of the way in real
time. But when dragging within the *same* column, this line short-circuits
before dispatching:

```ts
if (!overColumnId || activeColumn.id === overColumnId) return;
```

So same-column reordering only happens once, in `handleDragEnd`, on drop.
The dragged card's original slot just sits there dimmed (`opacity-50`) with
no neighbors animating around it until you release the mouse. Cross-column
drags feel alive; same-column drags feel unresponsive — an inconsistency a
user will notice immediately, and the more common of the two interactions.

**Fix:** dispatch `MOVE_CARD` in `handleDragOver` for the same-column case
too (guard against redundant dispatches when `activeIndex === toIndex`), the
same way the cross-column branch already does.

## 2. Cards advertise keyboard drag support that doesn't exist

**Files:** `frontend/components/KanbanBoard.tsx:25-27`, `frontend/components/KanbanCard.tsx`

`useSensors` only registers `PointerSensor`:

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
);
```

but `useSortable`'s `attributes` (spread onto the card's `<article>`) include
`role="button"`, `tabIndex={0}`, and `aria-roledescription="sortable"` —
this is dnd-kit's signal that the element is keyboard-operable. A keyboard
user can Tab to a card and it looks fully interactive, but Space/Arrow keys
do nothing because no `KeyboardSensor` is wired up. There is also no
non-drag fallback (e.g. a "move to..." menu) for moving cards without a
mouse. Right now cards can only ever be moved by pointer/touch drag.

**Fix:** either add `KeyboardSensor` (with `sortableKeyboardCoordinates`) so
the existing ARIA affordance is real, or provide a keyboard-accessible
alternative (e.g. a per-card overflow menu with "Move to <column>" actions).

## 3. Nested interactive elements on the card

**File:** `frontend/components/KanbanCard.tsx`

The `<article>` now carries `{...attributes}` (`role="button"`,
`tabIndex={0}`) from `useSortable`, and it contains a real `<button>`
(Delete) as a child — an interactive element nested inside another
interactive element. Screen readers and some browsers handle this
inconsistently (double-announce, unreliable focus/click targeting). This is
a side effect of making the whole card draggable to fix the drag-handle
bug; worth a second pass alongside item #2.

**Fix:** if the whole-card drag stays, use a `<div>` (not `role="button"`)
for the outer container with the drag listeners on a dedicated wrapper that
excludes the Delete button, or move Delete outside the sortable element's
hit area (e.g. via `data-no-dnd` + `onPointerDown` `stopPropagation` on the
button) so there's exactly one interactive role per hit target.

## 4. Submitting an empty card title fails silently

**File:** `frontend/components/AddCardForm.tsx:7-16`

```ts
const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
...
if (!title) return;
```

There's no `required` attribute and no error state. Clicking "Add card"
with an empty/whitespace title just does nothing — no shake, no message, no
focus shift. A user will conclude the button is broken.

**Fix:** add `required` to the title input (native browser validation UI is
enough for this MVP's scope), or show inline feedback when submission is
rejected.

## 5. Clearing a column title leaves it permanently blank

**File:** `frontend/components/KanbanColumn.tsx:36-42`

The title `<input>` dispatches `RENAME_COLUMN` on every keystroke with no
minimum-length guard and no blur-commit/revert:

```tsx
<input
  value={column.title}
  onChange={(event) => onRename(column.id, event.target.value)}
  ...
/>
```

If a user selects all text to retype the name and clicks away (or gets
interrupted) before typing a replacement, the column header is left empty
with no placeholder text — it looks broken, and there's no way to recover
the previous name.

**Fix:** add a `placeholder="Column name"`, and on blur, if the trimmed
value is empty, revert to the previous title instead of committing the
empty string.

---

None of the above are caught by the existing unit/e2e test suite — the
reducer tests only exercise `boardReducer` directly (always with valid
inputs), and the e2e suite doesn't cover empty-submission or keyboard-only
flows. Worth adding coverage for whichever of these get fixed.
