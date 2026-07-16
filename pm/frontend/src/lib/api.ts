import type { BoardData, Card, Column } from "./kanban";

type ApiCard = {
  id: number;
  column_id: number;
  title: string;
  details: string;
  position: number;
};

type ApiBoard = {
  columns: Array<{
    id: number;
    title: string;
    position: number;
    cards: ApiCard[];
  }>;
};

function toCard(c: ApiCard): Card {
  return { id: String(c.id), title: c.title, details: c.details };
}

export async function fetchBoard(): Promise<BoardData> {
  const res = await fetch("/api/board");
  if (!res.ok) throw new Error("Failed to load board");
  const data: ApiBoard = await res.json();

  const cards: Record<string, Card> = {};
  const columns: Column[] = data.columns.map((col) => {
    const cardIds = col.cards.map((c) => {
      const card = toCard(c);
      cards[card.id] = card;
      return card.id;
    });
    return { id: String(col.id), title: col.title, cardIds };
  });

  return { columns, cards };
}

export async function renameColumn(id: string, title: string): Promise<void> {
  const res = await fetch(`/api/columns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to rename column");
}

export async function createCard(
  columnId: string,
  title: string,
  details: string
): Promise<Card> {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column_id: Number(columnId), title, details }),
  });
  if (!res.ok) throw new Error("Failed to create card");
  return toCard(await res.json());
}

export async function deleteCard(id: string): Promise<void> {
  const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete card");
}

export async function moveCard(
  id: string,
  columnId: string,
  position: number
): Promise<void> {
  const res = await fetch(`/api/cards/${id}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column_id: Number(columnId), position }),
  });
  if (!res.ok) throw new Error("Failed to move card");
}
