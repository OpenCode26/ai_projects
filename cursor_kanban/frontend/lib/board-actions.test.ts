import { describe, expect, it, vi } from "vitest";
import { boardReducer, findCardColumn } from "./board-actions";
import { dummyBoard } from "./dummy-data";

describe("boardReducer", () => {
  it("adds a card to the target column", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-card-id" });

    const result = boardReducer(dummyBoard, {
      type: "ADD_CARD",
      columnId: "col-backlog",
      title: "New task",
      details: "Some details",
    });

    const column = result.columns.find((c) => c.id === "col-backlog");
    expect(column?.cards.at(-1)).toEqual({
      id: "new-card-id",
      title: "New task",
      details: "Some details",
    });
  });

  it("deletes a card from its column", () => {
    const result = boardReducer(dummyBoard, {
      type: "DELETE_CARD",
      columnId: "col-backlog",
      cardId: "card-1",
    });

    const column = result.columns.find((c) => c.id === "col-backlog");
    expect(column?.cards.some((card) => card.id === "card-1")).toBe(false);
  });

  it("renames a column", () => {
    const result = boardReducer(dummyBoard, {
      type: "RENAME_COLUMN",
      columnId: "col-todo",
      title: "Ready",
    });

    const column = result.columns.find((c) => c.id === "col-todo");
    expect(column?.title).toBe("Ready");
  });

  it("moves a card between columns", () => {
    const result = boardReducer(dummyBoard, {
      type: "MOVE_CARD",
      cardId: "card-1",
      fromColumnId: "col-backlog",
      toColumnId: "col-done",
      toIndex: 1,
    });

    const backlog = result.columns.find((c) => c.id === "col-backlog");
    const done = result.columns.find((c) => c.id === "col-done");

    expect(backlog?.cards.some((card) => card.id === "card-1")).toBe(false);
    expect(done?.cards[1]?.id).toBe("card-1");
  });

  it("reorders a card within the same column", () => {
    const result = boardReducer(dummyBoard, {
      type: "MOVE_CARD",
      cardId: "card-1",
      fromColumnId: "col-backlog",
      toColumnId: "col-backlog",
      toIndex: 1,
    });

    const backlog = result.columns.find((c) => c.id === "col-backlog");
    expect(backlog?.cards.map((card) => card.id)).toEqual(["card-2", "card-1"]);
  });
});

describe("findCardColumn", () => {
  it("returns the column containing the card", () => {
    expect(findCardColumn(dummyBoard, "card-5")?.id).toBe("col-in-progress");
  });
});

describe("dummyBoard", () => {
  it("has five columns with cards", () => {
    expect(dummyBoard.columns).toHaveLength(5);
    expect(dummyBoard.columns.every((column) => column.cards.length > 0)).toBe(
      true,
    );
  });
});
