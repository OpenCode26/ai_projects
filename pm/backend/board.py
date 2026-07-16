import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_conn

router = APIRouter(prefix="/api")


class CardOut(BaseModel):
    id: int
    column_id: int
    title: str
    details: str
    position: int


class ColumnOut(BaseModel):
    id: int
    title: str
    position: int
    cards: list[CardOut]


class BoardOut(BaseModel):
    columns: list[ColumnOut]


class RenameColumnBody(BaseModel):
    title: str


class CreateCardBody(BaseModel):
    column_id: int
    title: str
    details: str = ""


class UpdateCardBody(BaseModel):
    title: str
    details: str


class MoveCardBody(BaseModel):
    column_id: int
    position: int


@router.get("/board", response_model=BoardOut)
def get_board(conn: sqlite3.Connection = Depends(get_conn)):
    cols = conn.execute(
        "SELECT id, title, position FROM columns WHERE board_id = 1 ORDER BY position"
    ).fetchall()
    return BoardOut(columns=[_column_out(conn, col) for col in cols])


@router.patch("/columns/{column_id}", response_model=ColumnOut)
def rename_column(
    column_id: int,
    body: RenameColumnBody,
    conn: sqlite3.Connection = Depends(get_conn),
):
    col = conn.execute(
        "SELECT id, title, position FROM columns WHERE id = ? AND board_id = 1",
        (column_id,),
    ).fetchone()
    if not col:
        raise HTTPException(404, "Column not found")
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (body.title, column_id))
    return _column_out(conn, {"id": col["id"], "title": body.title, "position": col["position"]})


@router.post("/cards", response_model=CardOut, status_code=201)
def create_card(body: CreateCardBody, conn: sqlite3.Connection = Depends(get_conn)):
    if not _column_exists(conn, body.column_id):
        raise HTTPException(404, "Column not found")
    position = conn.execute(
        "SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM cards WHERE column_id = ?",
        (body.column_id,),
    ).fetchone()["pos"]
    cur = conn.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (body.column_id, body.title, body.details, position),
    )
    return CardOut(
        id=cur.lastrowid,
        column_id=body.column_id,
        title=body.title,
        details=body.details,
        position=position,
    )


@router.patch("/cards/{card_id}", response_model=CardOut)
def update_card(
    card_id: int,
    body: UpdateCardBody,
    conn: sqlite3.Connection = Depends(get_conn),
):
    card = conn.execute(
        "SELECT id, column_id, position FROM cards WHERE id = ?", (card_id,)
    ).fetchone()
    if not card:
        raise HTTPException(404, "Card not found")
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?",
        (body.title, body.details, card_id),
    )
    return CardOut(
        id=card["id"],
        column_id=card["column_id"],
        title=body.title,
        details=body.details,
        position=card["position"],
    )


@router.delete("/cards/{card_id}")
def delete_card(card_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    card = conn.execute(
        "SELECT id, column_id FROM cards WHERE id = ?", (card_id,)
    ).fetchone()
    if not card:
        raise HTTPException(404, "Card not found")
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _renumber_column(conn, card["column_id"])
    return {"ok": True}


@router.patch("/cards/{card_id}/move")
def move_card(
    card_id: int,
    body: MoveCardBody,
    conn: sqlite3.Connection = Depends(get_conn),
):
    card = conn.execute(
        "SELECT id, column_id FROM cards WHERE id = ?", (card_id,)
    ).fetchone()
    if not card:
        raise HTTPException(404, "Card not found")
    if not _column_exists(conn, body.column_id):
        raise HTTPException(404, "Column not found")

    old_col = card["column_id"]
    new_col = body.column_id
    pos = body.position

    if old_col == new_col:
        ids = [i for i in _column_card_ids(conn, old_col) if i != card_id]
        ids.insert(min(pos, len(ids)), card_id)
        _write_positions(conn, ids)
    else:
        old_ids = [i for i in _column_card_ids(conn, old_col) if i != card_id]
        new_ids = _column_card_ids(conn, new_col)
        new_ids.insert(min(pos, len(new_ids)), card_id)
        conn.execute("UPDATE cards SET column_id = ? WHERE id = ?", (new_col, card_id))
        _write_positions(conn, old_ids)
        _write_positions(conn, new_ids)

    return {"ok": True}


def _column_exists(conn: sqlite3.Connection, column_id: int) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM columns WHERE id = ? AND board_id = 1", (column_id,)
        ).fetchone()
        is not None
    )


def _column_out(conn: sqlite3.Connection, col) -> ColumnOut:
    cards = conn.execute(
        "SELECT id, column_id, title, details, position FROM cards "
        "WHERE column_id = ? ORDER BY position",
        (col["id"],),
    ).fetchall()
    return ColumnOut(
        id=col["id"],
        title=col["title"],
        position=col["position"],
        cards=[CardOut(**dict(c)) for c in cards],
    )


def _column_card_ids(conn: sqlite3.Connection, column_id: int) -> list[int]:
    return [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
        ).fetchall()
    ]


def _renumber_column(conn: sqlite3.Connection, column_id: int) -> None:
    _write_positions(conn, _column_card_ids(conn, column_id))


def _write_positions(conn: sqlite3.Connection, ids: list[int]) -> None:
    for i, card_id in enumerate(ids):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (i, card_id))
