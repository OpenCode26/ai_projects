"""Default seed data (PLAN.md §7 "Default Seed Data")."""

import uuid

import aiosqlite

from .connection import utcnow
from .tickers import DEFAULT_USER_ID

DEFAULT_CASH_BALANCE = 10000.0

DEFAULT_WATCHLIST = [
    "AAPL",
    "GOOGL",
    "MSFT",
    "AMZN",
    "TSLA",
    "NVDA",
    "META",
    "JPM",
    "V",
    "NFLX",
]


async def seed_defaults(
    conn: aiosqlite.Connection, user_id: str = DEFAULT_USER_ID
) -> bool:
    """Seed profile, watchlist, and opening snapshot on a fresh database.

    No-op when the profile row already exists, so a user who has deliberately
    emptied their watchlist does not get it repopulated on restart.
    """
    async with conn.execute(
        "SELECT 1 FROM users_profile WHERE id = ?", (user_id,)
    ) as cursor:
        if await cursor.fetchone() is not None:
            return False

    now = utcnow()
    await conn.execute(
        "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
        (user_id, DEFAULT_CASH_BALANCE, now),
    )
    await conn.executemany(
        "INSERT OR IGNORE INTO watchlist (id, user_id, ticker, added_at)"
        " VALUES (?, ?, ?, ?)",
        [(str(uuid.uuid4()), user_id, ticker, now) for ticker in DEFAULT_WATCHLIST],
    )
    await conn.execute(
        "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at)"
        " VALUES (?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, DEFAULT_CASH_BALANCE, now),
    )
    await conn.commit()
    return True
