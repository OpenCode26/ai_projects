"""SQLite connection management and lazy initialization (PLAN.md §7, §13.3).

A single shared aiosqlite connection is used for the whole process. aiosqlite
serializes operations onto its own worker thread, so concurrent coroutines
(SSE loop, request handlers, snapshot task) share it safely. Multi-statement
transactions must additionally hold `write_lock()`.
"""

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

_SCHEMA_PATH = Path(__file__).with_name("schema.sql")

_connection: aiosqlite.Connection | None = None
_locks: dict[str, tuple[asyncio.AbstractEventLoop, asyncio.Lock]] = {}
_db_path: Path | None = None


def _lock(name: str) -> asyncio.Lock:
    """An asyncio.Lock bound to the running loop.

    A Lock remembers the loop it was first awaited on and refuses to work on
    any other, so module-level locks must be rebuilt when the loop changes
    (test suites, and any restart of the app's loop within one process).
    """
    loop = asyncio.get_running_loop()
    cached = _locks.get(name)
    if cached is None or cached[0] is not loop:
        cached = (loop, asyncio.Lock())
        _locks[name] = cached
    return cached[1]


def utcnow() -> str:
    """Current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def default_db_path() -> Path:
    """Resolve the SQLite file location.

    `FINALLY_DB_PATH` wins; otherwise `/app/db` in the container, falling back
    to the project-root `db/` directory for local development.
    """
    env_path = os.getenv("FINALLY_DB_PATH")
    if env_path:
        return Path(env_path)
    container_dir = Path("/app/db")
    if container_dir.is_dir():
        return container_dir / "finally.db"
    return Path(__file__).resolve().parents[2] / "db" / "finally.db"


def set_db_path(path: str | Path) -> None:
    """Override the database location. Must be called before first use."""
    global _db_path
    _db_path = Path(path)


def get_db_path() -> Path:
    return _db_path if _db_path is not None else default_db_path()


def write_lock() -> asyncio.Lock:
    """Serializes multi-statement transactions (e.g. trade execution)."""
    return _lock("write")


async def get_connection() -> aiosqlite.Connection:
    """Return the shared connection, initializing schema and seed data once."""
    global _connection
    if _connection is not None:
        return _connection
    async with _lock("init"):
        if _connection is not None:
            return _connection
        path = get_db_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = await aiosqlite.connect(str(path))
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.execute("PRAGMA busy_timeout=5000")
        await _initialize(conn)
        _connection = conn
        return _connection


async def _initialize(conn: aiosqlite.Connection) -> None:
    await conn.executescript(_SCHEMA_PATH.read_text())
    await conn.commit()
    from .seed import seed_defaults

    await seed_defaults(conn)


async def close_connection() -> None:
    """Close the shared connection (shutdown, and between tests)."""
    global _connection
    if _connection is not None:
        await _connection.close()
        _connection = None
    _locks.clear()
