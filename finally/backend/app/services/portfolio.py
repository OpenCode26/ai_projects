"""Portfolio valuation, trade execution and snapshots.

Shared by the REST routes and the LLM chat flow — both go through
`execute_trade` and `load_portfolio` so manual and AI-initiated trades obey
identical validation and produce identical state (PLAN §9).
"""

import asyncio
import logging

from app import config
from app.market.service import get_service
from db import dao
from db.tickers import validate_ticker

logger = logging.getLogger("finally.portfolio")


def _price_for(ticker: str, fallback: float) -> float:
    """Latest cached price, falling back to cost basis until the feed covers it."""
    return get_service().cache.price(ticker) or fallback


async def load_portfolio() -> dict:
    """The `GET /api/portfolio` payload (also the LLM's portfolio context)."""
    cash = await dao.get_cash_balance()
    rows = await dao.get_positions()

    positions = []
    positions_value = 0.0
    cost_basis_total = 0.0

    for row in rows:
        quantity = float(row["quantity"])
        avg_cost = float(row["avg_cost"])
        price = _price_for(row["ticker"], avg_cost)
        market_value = quantity * price
        cost_basis = quantity * avg_cost
        unrealized_pnl = market_value - cost_basis

        positions_value += market_value
        cost_basis_total += cost_basis

        positions.append(
            {
                "ticker": row["ticker"],
                "quantity": quantity,
                "avg_cost": avg_cost,
                "current_price": price,
                "market_value": market_value,
                "cost_basis": cost_basis,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_pnl_pct": (
                    unrealized_pnl / cost_basis * 100 if cost_basis else 0.0
                ),
                "updated_at": row["updated_at"],
            }
        )

    total_value = cash + positions_value
    unrealized_pnl = positions_value - cost_basis_total

    for position in positions:
        position["weight_pct"] = (
            position["market_value"] / total_value * 100 if total_value else 0.0
        )

    return {
        "cash_balance": cash,
        "positions": positions,
        "positions_value": positions_value,
        "cost_basis": cost_basis_total,
        "total_value": total_value,
        "unrealized_pnl": unrealized_pnl,
        "unrealized_pnl_pct": (
            unrealized_pnl / cost_basis_total * 100 if cost_basis_total else 0.0
        ),
    }


async def load_watchlist() -> dict:
    """The `GET /api/watchlist` payload — tickers with their latest quotes."""
    cache = get_service().cache
    items = []
    for row in await dao.get_watchlist_rows():
        ticker = row["ticker"]
        quote = cache.get(ticker)
        items.append(
            {
                "ticker": ticker,
                "added_at": row["added_at"],
                "price": quote.price if quote else None,
                "previous_price": quote.previous_price if quote else None,
                "open_price": quote.open_price if quote else None,
                "change": quote.change if quote else None,
                "change_pct": quote.change_pct if quote else None,
                "direction": quote.direction if quote else None,
                "timestamp": quote.timestamp if quote else None,
            }
        )
    return {"watchlist": items}


async def execute_trade(ticker: str, side: str, quantity: float) -> dict:
    """Fill a market order at the current price and snapshot the result.

    Raises `InvalidTicker` or `dao.TradeValidationError`; callers turn those
    into a 400 (§8) or into chat error context (§9).
    """
    symbol = validate_ticker(ticker)
    quote = await get_service().ensure_quote(symbol)
    price = quote.price if quote else 0.0

    trade = await dao.execute_trade(symbol, side, quantity, price)
    await record_snapshot()
    return trade


async def add_to_watchlist(ticker: str) -> bool:
    symbol = validate_ticker(ticker)
    added = await dao.add_to_watchlist(symbol)
    await get_service().ensure_quote(symbol)
    return added


async def remove_from_watchlist(ticker: str) -> bool:
    return await dao.remove_from_watchlist(validate_ticker(ticker))


async def record_snapshot() -> float:
    portfolio = await load_portfolio()
    await dao.insert_snapshot(portfolio["total_value"])
    return portfolio["total_value"]


async def snapshot_loop() -> None:
    """Records portfolio value every 30s for the P&L chart (§7)."""
    while True:
        await asyncio.sleep(config.SNAPSHOT_INTERVAL_SECONDS)
        try:
            await record_snapshot()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("portfolio snapshot failed")
