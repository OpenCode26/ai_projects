"""Schema, lazy init, and seed data (PLAN.md §7)."""

import pytest

import db as dbmod
from db.tickers import InvalidTicker


async def test_lazy_init_creates_file_and_tables(tmp_path, monkeypatch):
    path = tmp_path / "nested" / "finally.db"
    monkeypatch.setenv("FINALLY_DB_PATH", str(path))
    dbmod.set_db_path(path)
    await dbmod.close_connection()

    assert not path.exists()
    conn = await dbmod.get_connection()
    assert path.exists()

    async with conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ) as cursor:
        tables = {row["name"] for row in await cursor.fetchall()}
    assert {
        "users_profile",
        "watchlist",
        "positions",
        "trades",
        "portfolio_snapshots",
        "chat_messages",
    } <= tables
    await dbmod.close_connection()


async def test_wal_mode_enabled(fresh_db):
    conn = await fresh_db.get_connection()
    async with conn.execute("PRAGMA journal_mode") as cursor:
        row = await cursor.fetchone()
    assert row[0].lower() == "wal"


async def test_seed_defaults(fresh_db):
    assert await fresh_db.get_cash_balance() == 10000.0
    assert await fresh_db.get_watchlist() == fresh_db.DEFAULT_WATCHLIST
    snapshots = await fresh_db.get_snapshots()
    assert len(snapshots) == 1
    assert snapshots[0]["total_value"] == 10000.0
    assert await fresh_db.get_positions() == []


async def test_init_is_idempotent_and_does_not_reseed(fresh_db, tmp_path):
    await fresh_db.remove_from_watchlist("AAPL")
    await fresh_db.set_cash_balance(1234.5)
    await fresh_db.close_connection()

    await fresh_db.init_db()
    assert "AAPL" not in await fresh_db.get_watchlist()
    assert await fresh_db.get_cash_balance() == 1234.5
    assert len(await fresh_db.get_snapshots()) == 1


@pytest.mark.parametrize(
    "raw,expected",
    [("aapl", "AAPL"), (" msft ", "MSFT"), ("brk", "BRK"), ("t", "T"), ("abcde", "ABCDE")],
)
def test_validate_ticker_normalizes(raw, expected):
    assert dbmod.validate_ticker(raw) == expected


@pytest.mark.parametrize("raw", ["", "TOOLONG", "AA PL", "AA-PL", "$AAPL", "   "])
def test_validate_ticker_rejects(raw):
    with pytest.raises(InvalidTicker):
        dbmod.validate_ticker(raw)
