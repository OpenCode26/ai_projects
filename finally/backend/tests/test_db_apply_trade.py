"""apply_trade: atomic persistence for callers that own the trade math."""

import pytest

from db.tickers import InvalidTicker


async def test_apply_trade_writes_cash_position_and_log_together(fresh_db):
    trade = await fresh_db.apply_trade(
        ticker="aapl",
        side="buy",
        quantity=10,
        price=100.0,
        new_cash_balance=9000.0,
        new_quantity=10,
        new_avg_cost=100.0,
    )

    assert trade["ticker"] == "AAPL"
    assert await fresh_db.get_cash_balance() == pytest.approx(9000.0)
    position = await fresh_db.get_position("AAPL")
    assert (position["quantity"], position["avg_cost"]) == (10, 100.0)
    assert len(await fresh_db.get_trades()) == 1


async def test_apply_trade_updates_existing_position_in_place(fresh_db):
    await fresh_db.apply_trade("AAPL", "buy", 10, 100.0, 9000.0, 10, 100.0)
    await fresh_db.apply_trade("AAPL", "buy", 10, 200.0, 7000.0, 20, 150.0)

    positions = await fresh_db.get_positions()
    assert len(positions) == 1
    assert positions[0]["quantity"] == pytest.approx(20)
    assert positions[0]["avg_cost"] == pytest.approx(150.0)


async def test_apply_trade_deletes_position_at_epsilon_zero(fresh_db):
    await fresh_db.apply_trade("AAPL", "buy", 10, 100.0, 9000.0, 10, 100.0)
    await fresh_db.apply_trade("AAPL", "sell", 10, 110.0, 10100.0, 1e-9, 100.0)

    assert await fresh_db.get_position("AAPL") is None
    assert len(await fresh_db.get_trades()) == 2


async def test_apply_trade_rejects_bad_ticker_before_writing(fresh_db):
    with pytest.raises(InvalidTicker):
        await fresh_db.apply_trade("TOOLONG", "buy", 1, 100.0, 9900.0, 1, 100.0)

    assert await fresh_db.get_cash_balance() == 10000.0
    assert await fresh_db.get_trades() == []


async def test_portfolio_state_reads_cash_and_positions_together(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 10, 100.0)
    state = await fresh_db.get_portfolio_state()

    assert state["cash_balance"] == pytest.approx(9000.0)
    assert [p["ticker"] for p in state["positions"]] == ["AAPL"]
