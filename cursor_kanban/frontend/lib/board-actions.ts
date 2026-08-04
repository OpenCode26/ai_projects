import type { Board, BoardAction } from "./types";

export function boardReducer(board: Board, action: BoardAction): Board {
  switch (action.type) {
    case "ADD_CARD":
      return {
        ...board,
        columns: board.columns.map((column) =>
          column.id === action.columnId
            ? {
                ...column,
                cards: [
                  ...column.cards,
                  {
                    id: crypto.randomUUID(),
                    title: action.title,
                    details: action.details,
                  },
                ],
              }
            : column,
        ),
      };

    case "DELETE_CARD":
      return {
        ...board,
        columns: board.columns.map((column) =>
          column.id === action.columnId
            ? {
                ...column,
                cards: column.cards.filter((card) => card.id !== action.cardId),
              }
            : column,
        ),
      };

    case "RENAME_COLUMN":
      return {
        ...board,
        columns: board.columns.map((column) =>
          column.id === action.columnId
            ? { ...column, title: action.title }
            : column,
        ),
      };

    case "MOVE_CARD": {
      const fromColumn = board.columns.find((c) => c.id === action.fromColumnId);
      const card = fromColumn?.cards.find((c) => c.id === action.cardId);
      if (!card) return board;

      const columnsWithoutCard = board.columns.map((column) =>
        column.id === action.fromColumnId
          ? {
              ...column,
              cards: column.cards.filter((c) => c.id !== action.cardId),
            }
          : column,
      );

      return {
        ...board,
        columns: columnsWithoutCard.map((column) => {
          if (column.id !== action.toColumnId) return column;

          const cards = [...column.cards];
          cards.splice(action.toIndex, 0, card);
          return { ...column, cards };
        }),
      };
    }

    default:
      return board;
  }
}

export function findCardColumn(board: Board, cardId: string) {
  return board.columns.find((column) =>
    column.cards.some((card) => card.id === cardId),
  );
}
