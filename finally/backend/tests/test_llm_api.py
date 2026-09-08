"""POST /api/chat end to end: real router, portfolio service, DB and simulator.

Runs with LLM_MOCK=true, so the only thing stubbed out is the model call.
"""

import pytest

from app import config
from db import dao


@pytest.fixture
async def chat_client(client, monkeypatch):
    """The real app, with only the model call stubbed out."""
    monkeypatch.setattr(config, "LLM_MOCK", True)
    return client


async def test_buy_executes_and_returns_post_trade_state(chat_client):
    response = await chat_client.post("/api/chat", json={"message": "buy 10 AAPL"})

    assert response.status_code == 200
    body = response.json()
    trade = body["trades"][0]
    assert (trade["ticker"], trade["side"], trade["quantity"]) == ("AAPL", "buy", 10)
    assert trade["status"] == "executed"
    assert trade["price"] > 0
    assert body["errors"] == []
    # §13.6: fresh post-execution state rides along.
    assert body["portfolio"]["cash_balance"] == pytest.approx(
        10_000.0 - trade["notional"]
    )
    assert body["portfolio"]["positions"][0]["ticker"] == "AAPL"
    assert await dao.get_position("AAPL") is not None


async def test_conversational_turn_returns_no_state(chat_client):
    response = await chat_client.post(
        "/api/chat", json={"message": "how is my portfolio doing?"}
    )

    body = response.json()
    assert body["trades"] == []
    assert body["portfolio"] is None
    assert body["watchlist"] is None


async def test_unaffordable_trade_reports_the_error_without_failing_the_turn(
    chat_client,
):
    response = await chat_client.post("/api/chat", json={"message": "buy 100000 AAPL"})

    # The chat turn still succeeds — only the trade fails (§9, §13.7).
    assert response.status_code == 200
    body = response.json()
    assert body["trades"][0]["status"] == "failed"
    assert "Insufficient cash" in body["errors"][0]
    assert await dao.get_cash_balance() == 10_000.0


async def test_watchlist_change_applies_to_the_database(chat_client):
    response = await chat_client.post(
        "/api/chat", json={"message": "add PYPL to my watchlist"}
    )

    body = response.json()
    assert body["watchlist_changes"][0] == {
        "ticker": "PYPL",
        "action": "add",
        "status": "executed",
        "error": None,
    }
    assert "PYPL" in await dao.get_watchlist()
    assert "PYPL" in [item["ticker"] for item in body["watchlist"]["watchlist"]]


async def test_removing_a_watched_ticker_keeps_the_position(chat_client):
    await chat_client.post("/api/chat", json={"message": "buy 2 NVDA"})

    await chat_client.post("/api/chat", json={"message": "remove NVDA"})

    # §8: dropping a ticker from the watchlist never touches the position.
    assert "NVDA" not in await dao.get_watchlist()
    assert await dao.get_position("NVDA") is not None


async def test_empty_message_is_rejected(chat_client):
    response = await chat_client.post("/api/chat", json={"message": "   "})

    assert response.status_code == 400
    assert response.json() == {"error": "Message cannot be empty"}


async def test_turn_is_persisted(chat_client):
    await chat_client.post("/api/chat", json={"message": "buy 1 AAPL"})

    history = await dao.get_recent_chat_messages()
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[1]["actions"]["trades"][0]["status"] == "executed"


async def test_chat_history_endpoint_returns_full_log_oldest_first(chat_client):
    await chat_client.post("/api/chat", json={"message": "buy 1 AAPL"})
    await chat_client.post("/api/chat", json={"message": "how is my portfolio doing?"})

    response = await chat_client.get("/api/chat/history")

    assert response.status_code == 200
    body = response.json()
    messages = body["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant"]
    assert messages[0]["content"] == "buy 1 AAPL"
    assert messages[1]["actions"]["trades"][0]["status"] == "executed"
    assert messages[2]["actions"] is None


async def test_chat_history_endpoint_empty_when_no_messages(chat_client):
    response = await chat_client.get("/api/chat/history")

    assert response.status_code == 200
    assert response.json() == {"messages": []}
