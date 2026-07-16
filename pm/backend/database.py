import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "kanban.db")

_DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]

_SCHEMA = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS columns (
        id INTEGER PRIMARY KEY,
        board_id INTEGER NOT NULL REFERENCES boards(id),
        title TEXT NOT NULL,
        position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY,
        column_id INTEGER NOT NULL REFERENCES columns(id),
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL
    );
"""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(path: str | None = None) -> None:
    path = path or DB_PATH
    conn = connect(path)
    conn.executescript(_SCHEMA)
    if not conn.execute("SELECT 1 FROM users").fetchone():
        conn.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (1, 'user', '')"
        )
        conn.execute("INSERT INTO boards (id, user_id) VALUES (1, 1)")
        for i, title in enumerate(_DEFAULT_COLUMNS):
            conn.execute(
                "INSERT INTO columns (board_id, title, position) VALUES (1, ?, ?)",
                (title, i),
            )
        conn.commit()
    conn.close()


def get_conn():
    conn = connect(DB_PATH)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
