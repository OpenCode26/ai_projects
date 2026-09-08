"""Chat orchestration: execution order, response state, persistence (§13.6/13.7)."""

import pytest

from app import config
from app.llm import service
from app.llm.schemas import LLMResponse, LLMTrade, LLMWatchlistChange
from db import dao
from db.tickers import InvalidTicker


class FakePortfolioService:
    """Deterministic stand-in for app.services.portfolio: fixed $100 fills."""

    def __init__(self):
        self.cash = 10_000.0
        self.watchlist: list[str] = ["AAPL"]
        self.calls: list[tuple] = []
        self.fail_on: dict[str, str] = {}

    async def load_portfolio(self) -> dict:
        return {
            "cash_balance": self.cash,
            "positions": [],
            "positions_value": 0.0,
            "total_value": self.cash,
            "unrealized_pnl": 0.0,
        }

    async def load_watchlist(self) -> dict:
        return {"watchlist": [{"ticker": t, "price": 100.0} for t in self.watchlist]}

    async def execute_trade(self, ticker: str, side: str, quantity: float) -> dict:
        self.calls.append(("trade", ticker, side, quantity))
        if ticker in self.fail_on:
            raise dao.TradeValidationError(self.fail_on[ticker])
        price = 100.0
        notional = quantity * price
        self.cash += notional if side == "sell" else -notional
        return {
            "ticker": ticker,
            "side": side,
            "quantity": quantity,
            "price": price,
            "notional": notional,
            "realized_pnl": 0.0 if side == "sell" else None,
            "cash_balance": self.cash,
        }

    async def add_to_watchlist(self, ticker: str) -> bool:
        self.calls.append(("add", ticker))
        if ticker == "BAD!":
            raise InvalidTicker(ticker)
        if ticker in self.watchlist:
            return False
        self.watchlist.append(ticker)
        return True

    async def remove_from_watchlist(self, ticker: str) -> bool:
        self.calls.append(("remove", ticker))
        if ticker not in self.watchlist:
            return False
        self.watchlist.remove(ticker)
        return True


@pytest.fixture
def fake_service(monkeypatch):
    """Swap the real portfolio service out so fills don't depend on the feed."""
    fake = FakePortfolioService()
    for name in (
        "load_portfolio",
        "load_watchlist",
        "execute_trade",
        "add_to_watchlist",
        "remove_from_watchlist",
    ):
        monkeypatch.setattr(
            service.portfolio_service, name, getattr(fake, name)
        )
    return fake


@pytest.fixture
def canned(monkeypatch):
    """Drive orchestration from a fixed LLM response, bypassing the matcher."""

    def _set(response: LLMResponse):
        monkeypatch.setattr(config, "LLM_MOCK", True)
        monkeypatch.setattr(service, "mock_response", lambda _message: response)

    return _set


async def test_conversational_turn_omits_state(fresh_db, fake_service, canned):
    canned(LLMResponse(message="Your portfolio is all cash."))

    response = await service.handle_chat("how am I doing?")

    assert response.message == "Your portfolio is all cash."
    assert response.trades == []
    # §13.6: no actions taken, so no portfolio/watchlist payload.
    assert response.portfolio is None
    assert response.watchlist is None


async def test_executed_trade_returns_post_execution_state(
    fresh_db, fake_service, canned
):
    canned(
        LLMResponse(
            message="Bought.",
            trades=[LLMTrade(ticker="AAPL", side="buy", quantity=10)],
        )
    )

    response = await service.handle_chat("buy 10 AAPL")

    trade = response.trades[0]
    assert trade.status == "executed"
    assert (trade.price, trade.notional) == (100.0, 1000.0)
    assert response.errors == []
    # §13.6: state is post-execution — cash already reflects the fill.
    assert response.portfolio["cash_balance"] == 9000.0


async def test_trades_execute_sequentially_in_array_order(
    fresh_db, fake_service, canned
):
    canned(
        LLMResponse(
            message="Rebalancing.",
            trades=[
                LLMTrade(ticker="TSLA", side="sell", quantity=5),
                LLMTrade(ticker="NVDA", side="buy", quantity=2),
            ],
        )
    )

    response = await service.handle_chat("rebalance")

    assert fake_service.calls == [
        ("trade", "TSLA", "sell", 5.0),
        ("trade", "NVDA", "buy", 2.0),
    ]
    assert [t.status for t in response.trades] == ["executed", "executed"]
    # §13.7: the sell funded the buy — 10000 + 500 - 200.
    assert response.portfolio["cash_balance"] == 10_300.0


async def test_failed_trade_skips_later_trades_but_not_watchlist(
    fresh_db, fake_service, canned
):
    fake_service.fail_on["NVDA"] = "Insufficient cash: NVDA buy costs too much"
    canned(
        LLMResponse(
            message="Working on it.",
            trades=[
                LLMTrade(ticker="NVDA", side="buy", quantity=999),
                LLMTrade(ticker="AAPL", side="buy", quantity=1),
            ],
            watchlist_changes=[LLMWatchlistChange(ticker="PYPL", action="add")],
        )
    )

    response = await service.handle_chat("go wild")

    assert [t.status for t in response.trades] == ["failed", "skipped"]
    # §13.7: the later trade is never attempted.
    assert ("trade", "AAPL", "buy", 1.0) not in fake_service.calls
    assert response.errors == ["Insufficient cash: NVDA buy costs too much"]
    # §13.7: watchlist changes still execute after a failed trade.
    assert response.watchlist_changes[0].status == "executed"
    assert "PYPL" in fake_service.watchlist


async def test_trades_run_before_watchlist_changes(fresh_db, fake_service, canned):
    canned(
        LLMResponse(
            message="Done.",
            trades=[LLMTrade(ticker="AAPL", side="buy", quantity=1)],
            watchlist_changes=[LLMWatchlistChange(ticker="AAPL", action="remove")],
        )
    )

    await service.handle_chat("buy then unwatch")

    assert fake_service.calls == [("trade", "AAPL", "buy", 1.0), ("remove", "AAPL")]


async def test_redundant_watchlist_change_is_not_an_error(
    fresh_db, fake_service, canned
):
    canned(
        LLMResponse(
            message="Already there.",
            watchlist_changes=[LLMWatchlistChange(ticker="AAPL", action="add")],
        )
    )

    response = await service.handle_chat("watch AAPL")

    assert response.watchlist_changes[0].status == "unchanged"
    assert response.errors == []


async def test_invalid_ticker_from_llm_fails_only_that_change(
    fresh_db, fake_service, canned
):
    canned(
        LLMResponse(
            message="Adding.",
            watchlist_changes=[
                LLMWatchlistChange(ticker="BAD!", action="add"),
                LLMWatchlistChange(ticker="SHOP", action="add"),
            ],
        )
    )

    response = await service.handle_chat("add some")

    assert [c.status for c in response.watchlist_changes] == ["failed", "executed"]
    assert len(response.errors) == 1


async def test_turn_is_persisted_with_actions(fresh_db, fake_service, canned):
    canned(
        LLMResponse(
            message="Bought 10 AAPL.",
            trades=[LLMTrade(ticker="AAPL", side="buy", quantity=10)],
        )
    )

    await service.handle_chat("buy 10 AAPL")
    history = await dao.get_recent_chat_messages()

    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[0]["content"] == "buy 10 AAPL"
    assert history[0]["actions"] is None
    assert history[1]["actions"]["trades"][0]["ticker"] == "AAPL"


async def test_conversational_turn_persists_without_actions(
    fresh_db, fake_service, canned
):
    canned(LLMResponse(message="All cash."))

    await service.handle_chat("status?")
    history = await dao.get_recent_chat_messages()

    assert history[1]["actions"] is None


async def test_history_is_capped_and_passed_to_the_model(
    fresh_db, fake_service, monkeypatch
):
    for i in range(15):
        await dao.insert_chat_message("user", f"message {i}")
        await dao.insert_chat_message("assistant", f"reply {i}")

    captured: list[list[dict]] = []

    async def fake_complete(messages):
        captured.append(messages)
        return LLMResponse(message="ok")

    monkeypatch.setattr(config, "LLM_MOCK", False)
    monkeypatch.setattr(service, "complete", fake_complete)

    await service.handle_chat("latest question")

    messages = captured[0]
    # 2 system messages (prompt + portfolio context) + 20 history + new message.
    assert len(messages) == 23
    assert messages[0]["role"] == "system"
    assert "CURRENT PORTFOLIO STATE" in messages[1]["content"]
    assert messages[-1] == {"role": "user", "content": "latest question"}
    # The just-sent message must not also appear in the replayed history.
    assert messages[-2]["content"] == "reply 14"
