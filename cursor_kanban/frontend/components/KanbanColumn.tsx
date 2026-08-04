"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Column } from "@/lib/types";
import { AddCardForm } from "./AddCardForm";
import { KanbanCard } from "./KanbanCard";

type KanbanColumnProps = {
  column: Column;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export function KanbanColumn({
  column,
  onRename,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  const [titleDraft, setTitleDraft] = useState(column.title);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(column.title);
      return;
    }
    setTitleDraft(trimmed);
    onRename(column.id, trimmed);
  }

  return (
    <section
      className="flex w-72 shrink-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/80 shadow-sm"
      data-testid={`column-${column.id}`}
    >
      <header className="border-b-2 border-accent px-4 py-3">
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={commitTitle}
          placeholder="Column name"
          className="w-full bg-transparent text-sm font-semibold uppercase tracking-wide text-navy focus:outline-none focus:ring-2 focus:ring-primary/30 rounded"
          aria-label={`Rename ${column.title}`}
          data-testid={`column-title-${column.id}`}
        />
        <p className="mt-1 text-xs text-muted">{column.cards.length} cards</p>
      </header>

      <div
        ref={setNodeRef}
        className={`flex min-h-48 flex-1 flex-col gap-3 overflow-y-auto p-3 transition ${
          isOver ? "bg-primary/5 ring-2 ring-inset ring-primary/30" : ""
        }`}
      >
        <SortableContext
          items={column.cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              columnId={column.id}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
      </div>

      <div className="border-t border-slate-200/80 p-3">
        <AddCardForm onAdd={(title, details) => onAddCard(column.id, title, details)} />
      </div>
    </section>
  );
}
