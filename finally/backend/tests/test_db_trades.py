"""Trade execution, cost basis, and validation (PLAN.md §7, §12, §13.8)."""

import pytest

from db.dao import TradeValidationError
from db.tickers import InvalidTicker


async def test_buy_debits_cash_and_opens_position(fresh_db):
    trade = await fresh_db.execute_trade("aapl", "buy", 10, 190.0)

    assert trade["ticker"] == "AAPL"
    assert trade["notional"] == 1900.0
    assert await fresh_db.get_cash_balance() == pytest.approx(8100.0)

    position = await fresh_db.get_position("AAPL")
    assert position["quantity"] == pytest.approx(10)
    assert position["avg_cost"] == pytest.approx(190.0)


async def test_second_buy_recomputes_weighted_average_cost(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 10, 100.0)
    await fresh_db.execute_trade("AAPL", "buy", 30, 200.0)

    position = await fresh_db.get_position("AAPL")
    assert position["quantity"] == pytest.approx(40)
    assert position["avg_cost"] == pytest.approx(175.0)  # (1000 + 6000) / 40
    assert await fresh_db.get_cash_balance() == pytest.approx(3000.0)


async def test_sell_credits_cash_and_leaves_avg_cost_unchanged(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 10, 100.0)
    trade = await fresh_db.execute_trade("AAPL", "sell", 4, 150.0)

    assert trade["realized_pnl"] == pytest.approx(200.0)  # (150 - 100) * 4
    position = await fresh_db.get_position("AAPL")
    assert position["quantity"] == pytest.approx(6)
    assert position["avg_cost"] == pytest.approx(100.0)
    assert await fresh_db.get_cash_balance() == pytest.approx(10000 - 1000 + 600)


async def test_sell_at_a_loss_reports_negative_realized_pnl(fresh_db):
    await fresh_db.execute_trade("TSLA", "buy", 5, 200.0)
    trade = await fresh_db.execute_trade("TSLA", "sell", 5, 150.0)

    assert trade["realized_pnl"] == pytest.approx(-250.0)
    assert await fresh_db.get_position("TSLA") is None


async def test_full_sell_deletes_position(fresh_db):
    await fresh_db.execute_trade("NVDA", "buy", 3, 100.0)
    await fresh_db.execute_trade("NVDA", "sell", 3, 120.0)

    assert await fresh_db.get_position("NVDA") is None
    assert await fresh_db.get_positions() == []


async def test_insufficient_cash_rejected_and_leaves_state_untouched(fresh_db):
    with pytest.raises(TradeValidationError, match="Insufficient cash"):
        await fresh_db.execute_trade("AAPL", "buy", 100, 500.0)

    assert await fresh_db.get_cash_balance() == 10000.0
    assert await fresh_db.get_position("AAPL") is None
    assert await fresh_db.get_trades() == []


async def test_insufficient_shares_rejected(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 2, 100.0)

    with pytest.raises(TradeValidationError, match="Insufficient shares"):
        await fresh_db.execute_trade("AAPL", "sell", 5, 100.0)

    position = await fresh_db.get_position("AAPL")
    assert position["quantity"] == pytest.approx(2)
    assert len(await fresh_db.get_trades()) == 1


async def test_selling_untracked_ticker_rejected(fresh_db):
    with pytest.raises(TradeValidationError, match="Insufficient shares"):
        await fresh_db.execute_trade("PYPL", "sell", 1, 50.0)


async def test_buy_of_exactly_all_cash_is_allowed(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 100, 100.0)
    assert await fresh_db.get_cash_balance() == pytest.approx(0.0)


async def test_fractional_shares_and_epsilon_zeroing(fresh_db):
    """Repeated fractional sells must not leave a dust position behind (§13.8)."""
    await fresh_db.execute_trade("AAPL", "buy", 0.3, 100.0)
    for _ in range(3):
        await fresh_db.execute_trade("AAPL", "sell", 0.1, 100.0)

    assert await fresh_db.get_position("AAPL") is None


async def test_sell_slightly_over_holding_within_epsilon_is_allowed(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 1.0, 100.0)
    await fresh_db.execute_trade("AAPL", "sell", 1.0 + 1e-9, 100.0)

    assert await fresh_db.get_position("AAPL") is None


@pytest.mark.parametrize("quantity", [0, -5, 1e-9])
async def test_non_positive_quantity_rejected(fresh_db, quantity):
    with pytest.raises(TradeValidationError, match="greater than zero"):
        await fresh_db.execute_trade("AAPL", "buy", quantity, 100.0)


async def test_invalid_side_rejected(fresh_db):
    with pytest.raises(TradeValidationError, match="Invalid side"):
        await fresh_db.execute_trade("AAPL", "short", 1, 100.0)


async def test_invalid_ticker_rejected(fresh_db):
    with pytest.raises(InvalidTicker):
        await fresh_db.execute_trade("TOOLONG", "buy", 1, 100.0)


async def test_trade_log_is_append_only_newest_first(fresh_db):
    await fresh_db.execute_trade("AAPL", "buy", 1, 100.0)
    await fresh_db.execute_trade("MSFT", "buy", 1, 100.0)
    await fresh_db.execute_trade("AAPL", "sell", 1, 110.0)

    trades = await fresh_db.get_trades()
    assert [(t["ticker"], t["side"]) for t in trades] == [
        ("AAPL", "sell"),
        ("MSFT", "buy"),
        ("AAPL", "buy"),
    ]
    assert len(await fresh_db.get_trades(limit=2)) == 2


async def test_sequential_trades_see_prior_state(fresh_db):
    """A sell can fund a later buy in the same chat turn (§13.7)."""
    await fresh_db.execute_trade("AAPL", "buy", 100, 100.0)  # spends all cash
    await fresh_db.execute_trade("AAPL", "sell", 50, 120.0)  # +6000
    await fresh_db.execute_trade("MSFT", "buy", 20, 300.0)  # -6000

    assert await fresh_db.get_cash_balance() == pytest.approx(0.0)
    assert (await fresh_db.get_position("MSFT"))["quantity"] == pytest.approx(20)
