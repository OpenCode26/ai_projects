import type { Card } from "@/lib/types";

type KanbanCardPreviewProps = {
  card: Card;
};

export function KanbanCardPreview({ card }: KanbanCardPreviewProps) {
  return (
    <article className="w-72 rotate-2 scale-105 rounded-xl border border-accent/60 bg-white p-4 shadow-lg ring-2 ring-accent/40">
      <h3 className="text-sm font-semibold text-navy">{card.title}</h3>
      {card.details ? (
        <p className="mt-1 text-sm leading-relaxed text-muted">{card.details}</p>
      ) : null}
    </article>
  );
}
