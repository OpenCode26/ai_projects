"""Concurrent DAO use must not corrupt cash or position state (PLAN.md §13.3)."""

import asyncio

import pytest

from db.dao import TradeValidationError


async def test_concurrent_buys_do_not_overspend_cash(fresh_db):
    """20 concurrent $600 buys against $10k: at most 16 fill, cash never goes negative."""
    results = await asyncio.gather(
        *(fresh_db.execute_trade("AAPL", "buy", 6, 100.0) for _ in range(20)),
        return_exceptions=True,
    )

    filled = [r for r in results if not isinstance(r, BaseException)]
    rejected = [r for r in results if isinstance(r, TradeValidationError)]
    assert len(filled) + len(rejected) == 20
    assert len(filled) == 16

    cash = await fresh_db.get_cash_balance()
    assert cash >= 0
    assert cash == pytest.approx(10000.0 - len(filled) * 600.0)

    position = await fresh_db.get_position("AAPL")
    assert position["quantity"] == pytest.approx(len(filled) * 6)
    assert len(await fresh_db.get_trades()) == len(filled)


async def test_concurrent_watchlist_adds_dedupe(fresh_db):
    results = await asyncio.gather(
        *(fresh_db.add_to_watchlist("pypl") for _ in range(10))
    )

    assert sum(results) == 1
    assert (await fresh_db.get_watchlist()).count("PYPL") == 1
