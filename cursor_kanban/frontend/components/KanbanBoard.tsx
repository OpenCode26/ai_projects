"use client";

import { useReducer, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { dummyBoard } from "@/lib/dummy-data";
import { boardReducer, findCardColumn } from "@/lib/board-actions";
import type { Card } from "@/lib/types";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCardPreview } from "./KanbanCardPreview";

export function KanbanBoard() {
  const [board, dispatch] = useReducer(boardReducer, dummyBoard);
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as Card | undefined;
    if (card) setActiveCard(card);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeColumn = findCardColumn(board, activeId);
    if (!activeColumn) return;

    let overColumnId = over.data.current?.columnId as string | undefined;
    if (!overColumnId) {
      const overColumn = board.columns.find((column) => column.id === overId);
      overColumnId = overColumn?.id;
    }
    if (!overColumnId) {
      const overCardColumn = findCardColumn(board, overId);
      overColumnId = overCardColumn?.id;
    }
    if (!overColumnId) return;

    const overColumn = board.columns.find((column) => column.id === overColumnId);
    if (!overColumn) return;

    const overIndex = overColumn.cards.findIndex((card) => card.id === overId);
    const toIndex = overIndex >= 0 ? overIndex : overColumn.cards.length;

    if (activeColumn.id === overColumnId) {
      const activeIndex = activeColumn.cards.findIndex((card) => card.id === activeId);
      if (activeIndex === toIndex) return;
    }

    dispatch({
      type: "MOVE_CARD",
      cardId: activeId,
      fromColumnId: activeColumn.id,
      toColumnId: overColumnId,
      toIndex,
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeColumn = findCardColumn(board, activeId);
    if (!activeColumn) return;

    let overColumnId = over.data.current?.columnId as string | undefined;
    if (!overColumnId) {
      const overColumn = board.columns.find((column) => column.id === overId);
      overColumnId = overColumn?.id;
    }
    if (!overColumnId) {
      const overCardColumn = findCardColumn(board, overId);
      overColumnId = overCardColumn?.id;
    }
    if (!overColumnId) return;

    const overColumn = board.columns.find((column) => column.id === overColumnId);
    if (!overColumn) return;

    const activeIndex = activeColumn.cards.findIndex((card) => card.id === activeId);
    const overIndex = overColumn.cards.findIndex((card) => card.id === overId);
    const toIndex = overIndex >= 0 ? overIndex : overColumn.cards.length;

    if (activeColumn.id === overColumnId && activeIndex === toIndex) return;

    dispatch({
      type: "MOVE_CARD",
      cardId: activeId,
      fromColumnId: activeColumn.id,
      toColumnId: overColumnId,
      toIndex,
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200/80 bg-white px-6 py-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
          Kanban Board
        </p>
        <h1 className="mt-1 text-2xl font-bold text-navy" data-testid="board-title">
          {board.title}
        </h1>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <main className="flex-1 overflow-x-auto px-6 py-6">
          <div className="flex min-w-max gap-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                onRename={(columnId, title) =>
                  dispatch({ type: "RENAME_COLUMN", columnId, title })
                }
                onAddCard={(columnId, title, details) =>
                  dispatch({ type: "ADD_CARD", columnId, title, details })
                }
                onDeleteCard={(columnId, cardId) =>
                  dispatch({ type: "DELETE_CARD", columnId, cardId })
                }
              />
            ))}
          </div>
        </main>

        <DragOverlay>
          {activeCard ? <KanbanCardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
