"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "@/lib/types";

type KanbanCardProps = {
  card: Card;
  columnId: string;
  onDelete: (columnId: string, cardId: string) => void;
};

export function KanbanCard({ card, columnId, onDelete }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: "card", columnId, card } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`group cursor-grab rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-accent/60 hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-lg ring-2 ring-accent/40" : ""
      }`}
      data-testid={`card-${card.id}`}
      aria-label={`${card.title} card`}
      {...attributes}
      {...listeners}
      role="group"
    >
      <div className="flex items-start gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="currentColor"
          className="mt-0.5 shrink-0 text-muted"
          aria-hidden
        >
          <circle cx="4" cy="3" r="1.2" />
          <circle cx="10" cy="3" r="1.2" />
          <circle cx="4" cy="7" r="1.2" />
          <circle cx="10" cy="7" r="1.2" />
          <circle cx="4" cy="11" r="1.2" />
          <circle cx="10" cy="11" r="1.2" />
        </svg>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-navy">{card.title}</h3>
          {card.details ? (
            <p className="mt-1 text-sm leading-relaxed text-muted">{card.details}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDelete(columnId, card.id)}
          onPointerDown={(event) => event.stopPropagation()}
          className="rounded-md px-1.5 py-0.5 text-xs text-muted opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          aria-label={`Delete ${card.title}`}
          data-testid={`delete-${card.id}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
