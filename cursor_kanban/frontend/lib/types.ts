export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cards: Card[];
};

export type Board = {
  title: string;
  columns: Column[];
};

export type BoardAction =
  | { type: "ADD_CARD"; columnId: string; title: string; details: string }
  | { type: "DELETE_CARD"; columnId: string; cardId: string }
  | { type: "RENAME_COLUMN"; columnId: string; title: string }
  | {
      type: "MOVE_CARD";
      cardId: string;
      fromColumnId: string;
      toColumnId: string;
      toIndex: number;
    };
