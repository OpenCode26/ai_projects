"""Chat orchestration: context -> LLM -> action execution -> persistence.

Implements PLAN §9 steps 1-8, with the execution ordering of §13.7 and the
response shape of §13.6.
"""

from typing import Any

from app import config
from app.llm.client import complete
from app.llm.mock import mock_response
from app.llm.prompts import build_messages, build_portfolio_context
from app.llm.schemas import (
    ChatResponse,
    ExecutedTrade,
    ExecutedWatchlistChange,
    LLMResponse,
    LLMTrade,
    LLMWatchlistChange,
)
from app.services import portfolio as portfolio_service
from db import dao
from db.tickers import InvalidTicker

# §9 step 2: last 20 messages / 10 turns, to bound prompt size, cost, latency.
HISTORY_LIMIT = 20

SKIPPED_REASON = "Skipped because an earlier trade in this request failed."

# Trade validation failures are expected outcomes, not bugs: they are reported
# back into the chat so the assistant can explain them (§9, §13.7).
TRADE_ERRORS = (dao.TradeValidationError, InvalidTicker)


async def _load_state() -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        await portfolio_service.load_portfolio(),
        await portfolio_service.load_watchlist(),
    )


async def _generate(
    user_message: str, portfolio: dict[str, Any], watchlist: dict[str, Any]
) -> LLMResponse:
    if config.LLM_MOCK:
        return mock_response(user_message)

    history = await dao.get_recent_chat_messages(limit=HISTORY_LIMIT)
    context = build_portfolio_context(portfolio, watchlist)
    return await complete(build_messages(user_message, context, history))


async def _execute_trades(
    trades: list[LLMTrade],
) -> tuple[list[ExecutedTrade], list[str]]:
    """Run trades in array order; a failure skips the rest of them (§13.7)."""
    results: list[ExecutedTrade] = []
    errors: list[str] = []
    aborted = False

    for trade in trades:
        if aborted:
            results.append(
                ExecutedTrade(
                    ticker=trade.ticker,
                    side=trade.side,
                    quantity=trade.quantity,
                    status="skipped",
                    error=SKIPPED_REASON,
                )
            )
            continue

        try:
            filled = await portfolio_service.execute_trade(
                trade.ticker, trade.side, trade.quantity
            )
        except TRADE_ERRORS as exc:
            aborted = True
            errors.append(str(exc))
            results.append(
                ExecutedTrade(
                    ticker=trade.ticker,
                    side=trade.side,
                    quantity=trade.quantity,
                    status="failed",
                    error=str(exc),
                )
            )
            continue

        results.append(
            ExecutedTrade(
                ticker=filled.get("ticker", trade.ticker),
                side=filled.get("side", trade.side),
                quantity=filled.get("quantity", trade.quantity),
                status="executed",
                price=filled.get("price"),
                notional=filled.get("notional"),
                realized_pnl=filled.get("realized_pnl"),
            )
        )

    return results, errors


async def _execute_watchlist_changes(
    changes: list[LLMWatchlistChange],
) -> tuple[list[ExecutedWatchlistChange], list[str]]:
    """Watchlist changes run after all trades, and never abort each other."""
    results: list[ExecutedWatchlistChange] = []
    errors: list[str] = []

    for change in changes:
        try:
            if change.action == "add":
                changed = await portfolio_service.add_to_watchlist(change.ticker)
            else:
                changed = await portfolio_service.remove_from_watchlist(change.ticker)
        except InvalidTicker as exc:
            errors.append(str(exc))
            results.append(
                ExecutedWatchlistChange(
                    ticker=change.ticker,
                    action=change.action,
                    status="failed",
                    error=str(exc),
                )
            )
            continue

        results.append(
            ExecutedWatchlistChange(
                ticker=change.ticker.upper(),
                action=change.action,
                status="executed" if changed else "unchanged",
            )
        )

    return results, errors


async def handle_chat(user_message: str) -> ChatResponse:
    """One full chat turn (§9 steps 1-8)."""
    portfolio, watchlist = await _load_state()
    llm = await _generate(user_message, portfolio, watchlist)

    executed_trades, errors = await _execute_trades(llm.trades)
    executed_changes, watchlist_errors = await _execute_watchlist_changes(
        llm.watchlist_changes
    )
    errors.extend(watchlist_errors)

    response = ChatResponse(
        message=llm.message,
        trades=executed_trades,
        watchlist_changes=executed_changes,
        errors=errors,
    )

    # §13.6: any turn that proposed actions carries post-execution state back,
    # so the frontend never has to guess whether to re-fetch.
    if executed_trades or executed_changes:
        response.portfolio, response.watchlist = await _load_state()

    await _persist(user_message, response)
    return response


async def _persist(user_message: str, response: ChatResponse) -> None:
    actions = None
    if response.trades or response.watchlist_changes or response.errors:
        actions = {
            "trades": [t.model_dump() for t in response.trades],
            "watchlist_changes": [c.model_dump() for c in response.watchlist_changes],
            "errors": response.errors,
        }
    await dao.insert_chat_message("user", user_message)
    await dao.insert_chat_message("assistant", response.message, actions)
