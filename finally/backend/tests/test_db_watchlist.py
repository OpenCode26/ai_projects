"""Watchlist DAO behavior (PLAN.md §7, §8)."""


async def test_add_is_case_insensitive_and_deduplicated(fresh_db):
    assert await fresh_db.add_to_watchlist("pypl") is True
    assert "PYPL" in await fresh_db.get_watchlist()

    assert await fresh_db.add_to_watchlist("PYPL") is False
    assert await fresh_db.add_to_watchlist("PyPl") is False
    assert (await fresh_db.get_watchlist()).count("PYPL") == 1


async def test_remove_reports_whether_it_existed(fresh_db):
    assert await fresh_db.remove_from_watchlist("aapl") is True
    assert "AAPL" not in await fresh_db.get_watchlist()
    assert await fresh_db.remove_from_watchlist("AAPL") is False


async def test_is_in_watchlist(fresh_db):
    assert await fresh_db.is_in_watchlist("nvda") is True
    assert await fresh_db.is_in_watchlist("PYPL") is False


async def test_remove_leaves_position_intact_and_still_tracked(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 2, 100.0)
    await fresh_db.remove_from_watchlist("AAPL")

    assert "AAPL" not in await fresh_db.get_watchlist()
    position = await fresh_db.get_position("AAPL")
    assert position is not None and position["quantity"] == 2
    assert "AAPL" in await fresh_db.get_tracked_tickers()


async def test_watchlist_rows_carry_metadata_in_insertion_order(fresh_db):
    rows = await fresh_db.get_watchlist_rows()

    assert [r["ticker"] for r in rows] == fresh_db.DEFAULT_WATCHLIST
    assert set(rows[0]) >= {"id", "user_id", "ticker", "added_at"}

    await fresh_db.add_to_watchlist("pypl")
    assert (await fresh_db.get_watchlist_rows())[-1]["ticker"] == "PYPL"


async def test_tracked_tickers_is_union_without_duplicates(fresh_db):
    await fresh_db.execute_trade("MSFT", "buy", 1, 50.0)
    tracked = await fresh_db.get_tracked_tickers()

    assert tracked.count("MSFT") == 1
    assert set(fresh_db.DEFAULT_WATCHLIST) <= set(tracked)
