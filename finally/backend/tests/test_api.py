import asyncio
import json

import pytest

DEFAULT_WATCHLIST = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]


async def test_health(client):
    body = (await client.get("/api/health")).json()
    assert body["status"] == "ok"
    assert body["market_data_source"] == "simulator"


async def test_fresh_start_seeds_watchlist_and_cash(client):
    watchlist = (await client.get("/api/watchlist")).json()["watchlist"]
    assert [item["ticker"] for item in watchlist] == DEFAULT_WATCHLIST
    assert all(item["price"] > 0 for item in watchlist)
    assert all(item["added_at"] for item in watchlist)

    portfolio = (await client.get("/api/portfolio")).json()
    assert portfolio["cash_balance"] == 10000.0
    assert portfolio["positions"] == []
    assert portfolio["total_value"] == 10000.0


async def test_history_is_never_empty_on_a_fresh_start(client):
    snapshots = (await client.get("/api/portfolio/history")).json()["snapshots"]
    assert snapshots and snapshots[0]["total_value"] == 10000.0


async def test_buy_moves_cash_into_a_position(client):
    response = await client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 10, "side": "buy"}
    )
    assert response.status_code == 200
    body = response.json()

    trade = body["trade"]
    assert (trade["ticker"], trade["side"], trade["quantity"]) == ("AAPL", "buy", 10.0)
    assert trade["notional"] == pytest.approx(trade["price"] * 10)

    portfolio = body["portfolio"]
    assert portfolio["cash_balance"] == pytest.approx(10000.0 - trade["notional"])
    (position,) = portfolio["positions"]
    assert position["ticker"] == "AAPL"
    assert position["quantity"] == 10.0
    assert position["avg_cost"] == pytest.approx(trade["price"])
    assert portfolio["total_value"] == pytest.approx(
        portfolio["cash_balance"] + position["market_value"]
    )


async def test_lowercase_ticker_is_normalized(client):
    body = (
        await client.post(
            "/api/portfolio/trade",
            json={"ticker": "aapl", "quantity": 1, "side": "buy"},
        )
    ).json()
    assert body["trade"]["ticker"] == "AAPL"
    assert [p["ticker"] for p in body["portfolio"]["positions"]] == ["AAPL"]


async def test_sell_returns_cash_and_reports_realized_pnl(client):
    await client.post(
        "/api/portfolio/trade", json={"ticker": "MSFT", "quantity": 4, "side": "buy"}
    )
    body = (
        await client.post(
            "/api/portfolio/trade",
            json={"ticker": "MSFT", "quantity": 4, "side": "sell"},
        )
    ).json()

    assert body["trade"]["realized_pnl"] is not None
    assert body["portfolio"]["positions"] == []
    assert body["portfolio"]["cash_balance"] == pytest.approx(10000.0, abs=50.0)


async def test_partial_sell_leaves_avg_cost_untouched(client):
    buy = (
        await client.post(
            "/api/portfolio/trade",
            json={"ticker": "JPM", "quantity": 10, "side": "buy"},
        )
    ).json()
    avg_cost = buy["portfolio"]["positions"][0]["avg_cost"]

    sell = (
        await client.post(
            "/api/portfolio/trade",
            json={"ticker": "JPM", "quantity": 4, "side": "sell"},
        )
    ).json()
    (position,) = sell["portfolio"]["positions"]
    assert position["quantity"] == pytest.approx(6.0)
    assert position["avg_cost"] == pytest.approx(avg_cost)


async def test_fractional_shares_round_trip_to_an_empty_position(client):
    for _ in range(3):
        await client.post(
            "/api/portfolio/trade",
            json={"ticker": "V", "quantity": 0.1, "side": "buy"},
        )
    body = (
        await client.post(
            "/api/portfolio/trade",
            json={"ticker": "V", "quantity": 0.30000000000000004, "side": "sell"},
        )
    ).json()
    assert body["portfolio"]["positions"] == []


async def test_buy_beyond_cash_is_rejected(client):
    response = await client.post(
        "/api/portfolio/trade",
        json={"ticker": "NVDA", "quantity": 10000, "side": "buy"},
    )
    assert response.status_code == 400
    assert "Insufficient cash" in response.json()["error"]
    assert (await client.get("/api/portfolio")).json()["cash_balance"] == 10000.0


async def test_selling_shares_you_do_not_own_is_rejected(client):
    response = await client.post(
        "/api/portfolio/trade", json={"ticker": "TSLA", "quantity": 1, "side": "sell"}
    )
    assert response.status_code == 400
    assert "error" in response.json()


@pytest.mark.parametrize(
    "payload",
    [
        {"ticker": "TOOLONG", "quantity": 1, "side": "buy"},
        {"ticker": "AA-PL", "quantity": 1, "side": "buy"},
        {"ticker": "", "quantity": 1, "side": "buy"},
        {"ticker": "AAPL", "quantity": 0, "side": "buy"},
        {"ticker": "AAPL", "quantity": -5, "side": "buy"},
        {"ticker": "AAPL", "quantity": 1, "side": "hold"},
    ],
)
async def test_malformed_trades_are_rejected_with_an_error_message(client, payload):
    response = await client.post("/api/portfolio/trade", json=payload)
    assert response.status_code == 400
    assert response.json()["error"]


async def test_trade_log_is_most_recent_first(client):
    for ticker in ("AAPL", "MSFT"):
        await client.post(
            "/api/portfolio/trade",
            json={"ticker": ticker, "quantity": 1, "side": "buy"},
        )
    trades = (await client.get("/api/trades")).json()["trades"]
    assert [t["ticker"] for t in trades] == ["MSFT", "AAPL"]


async def test_each_trade_records_a_snapshot(client):
    before = len((await client.get("/api/portfolio/history")).json()["snapshots"])
    await client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"}
    )
    after = (await client.get("/api/portfolio/history")).json()["snapshots"]
    assert len(after) == before + 1


async def test_add_and_remove_a_watchlist_ticker(client):
    body = (await client.post("/api/watchlist", json={"ticker": "pypl"})).json()
    assert body["added"] is True
    assert "PYPL" in [item["ticker"] for item in body["watchlist"]]

    again = (await client.post("/api/watchlist", json={"ticker": "PYPL"})).json()
    assert again["added"] is False

    removed = (await client.delete("/api/watchlist/pypl")).json()
    assert "PYPL" not in [item["ticker"] for item in removed["watchlist"]]


async def test_removing_an_absent_ticker_is_a_404(client):
    response = await client.delete("/api/watchlist/ZZZZ")
    assert response.status_code == 404
    assert response.json()["error"]


async def test_invalid_watchlist_ticker_is_rejected(client):
    response = await client.post("/api/watchlist", json={"ticker": "NOTATICKER"})
    assert response.status_code == 400
    assert response.json()["error"]


async def test_a_new_watchlist_ticker_is_priced_immediately(client):
    body = (await client.post("/api/watchlist", json={"ticker": "SHOP"})).json()
    shop = next(item for item in body["watchlist"] if item["ticker"] == "SHOP")
    assert shop["price"] and 10 <= shop["price"] <= 500


async def test_position_keeps_its_price_after_leaving_the_watchlist(client):
    """PLAN §6/§8: tracking follows open positions, not just the watchlist."""
    await client.post(
        "/api/portfolio/trade", json={"ticker": "NFLX", "quantity": 1, "side": "buy"}
    )
    await client.delete("/api/watchlist/NFLX")

    watchlist = (await client.get("/api/watchlist")).json()["watchlist"]
    assert "NFLX" not in [item["ticker"] for item in watchlist]

    portfolio = (await client.get("/api/portfolio")).json()
    (position,) = portfolio["positions"]
    assert position["ticker"] == "NFLX"
    assert position["current_price"] > 0


async def test_sse_streams_price_events(client):
    """Drives the event generator directly.

    httpx's ASGI transport buffers a response until it completes, so it can
    never consume an open-ended stream; the generator is the logic under test.
    """
    from app.routers.stream import _events

    chunks = []
    stream = _events()
    try:
        while len(chunks) < 12:
            chunks.append(await asyncio.wait_for(anext(stream), timeout=5))
    finally:
        await stream.aclose()

    assert chunks[0].startswith("retry:")
    events = [
        json.loads(chunk[len("data: ") :])
        for chunk in chunks
        if chunk.startswith("data: ")
    ]
    assert len(events) >= 10
    assert {event["ticker"] for event in events} <= set(DEFAULT_WATCHLIST)
    for event in events:
        assert event["price"] > 0
        assert event["direction"] in ("up", "down", "flat")
        assert event["timestamp"]
        assert "previous_price" in event and "change_pct" in event


async def test_sse_unsubscribes_when_a_client_goes_away(client):
    from app.market.service import get_service
    from app.routers.stream import _events

    service = get_service()
    stream = _events()
    await anext(stream)
    assert len(service._subscribers) == 1

    await stream.aclose()
    assert service._subscribers == set()


async def test_all_documented_routes_are_mounted(client):
    paths = (await client.get("/openapi.json")).json()["paths"]
    assert {
        "/api/health",
        "/api/stream/prices",
        "/api/portfolio",
        "/api/portfolio/trade",
        "/api/portfolio/history",
        "/api/trades",
        "/api/watchlist",
        "/api/watchlist/{ticker}",
    } <= set(paths)


async def test_static_placeholder_serves_when_no_frontend_build(client):
    response = await client.get("/")
    assert response.status_code == 200
    assert "FinAlly backend is running" in response.text
