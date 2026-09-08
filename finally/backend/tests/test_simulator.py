import random

import pytest

from app.market.base import seed_price
from app.market.cache import PriceCache
from app.market.simulator import SEED_PRICES, MarketSimulator

TICKERS = list(SEED_PRICES)


def test_seed_prices_are_used_for_known_tickers():
    sim = MarketSimulator(random.Random(1))
    sim._ensure_seeded("AAPL")
    assert sim._prices["AAPL"] == SEED_PRICES["AAPL"]


def test_unknown_ticker_seed_is_deterministic_and_in_range():
    assert seed_price("PYPL") == seed_price("PYPL")
    assert seed_price("PYPL") != seed_price("SHOP")
    for ticker in ("PYPL", "SHOP", "ZZZZZ", "F"):
        assert 10 <= seed_price(ticker) <= 499


def test_step_returns_positive_prices_for_every_requested_ticker():
    sim = MarketSimulator(random.Random(7))
    for _ in range(200):
        prices = sim.step(TICKERS)
        assert set(prices) == set(TICKERS)
        assert all(price > 0 for price in prices.values())


def test_prices_stay_in_a_plausible_range_over_a_long_session():
    """~10 minutes of ticks shouldn't send a name to zero or the moon."""
    sim = MarketSimulator(random.Random(11))
    for _ in range(1200):
        prices = sim.step(TICKERS)
    for ticker, price in prices.items():
        assert 0.2 * SEED_PRICES[ticker] < price < 5 * SEED_PRICES[ticker]


def test_same_seed_reproduces_the_same_path():
    a = MarketSimulator(random.Random(42))
    b = MarketSimulator(random.Random(42))
    for _ in range(50):
        assert a.step(TICKERS) == b.step(TICKERS)


def test_tickers_are_correlated_not_independent():
    """Shared market and sector factors should push names the same way."""
    sim = MarketSimulator(random.Random(3))
    previous = sim.step(TICKERS)
    agreement = 0
    rounds = 400
    for _ in range(rounds):
        current = sim.step(TICKERS)
        ups = sum(current[t] > previous[t] for t in TICKERS)
        agreement += max(ups, len(TICKERS) - ups)
        previous = current
    # Independent names would average ~62% agreement across 10 tickers.
    assert agreement / (rounds * len(TICKERS)) > 0.72


@pytest.mark.parametrize("ticker", ["AAPL", "PYPL"])
async def test_poll_matches_the_source_interface(ticker):
    sim = MarketSimulator(random.Random(5))
    prices = await sim.poll([ticker])
    assert prices[ticker] > 0
    assert sim.interval_seconds > 0


def test_cache_tracks_direction_previous_and_open():
    cache = PriceCache()
    (first,) = cache.apply({"AAPL": 100.0})
    assert (first.previous_price, first.open_price, first.direction) == (
        100.0,
        100.0,
        "flat",
    )

    (up,) = cache.apply({"AAPL": 101.0})
    assert (up.previous_price, up.open_price, up.direction) == (100.0, 100.0, "up")
    assert up.change == pytest.approx(1.0)
    assert up.change_pct == pytest.approx(1.0)

    (down,) = cache.apply({"AAPL": 99.0})
    assert (down.previous_price, down.direction) == (101.0, "down")


def test_cache_suppresses_unchanged_prices():
    cache = PriceCache()
    cache.apply({"AAPL": 100.0})
    assert cache.apply({"AAPL": 100.0}) == []
    assert cache.price("AAPL") == 100.0


def test_massive_snapshot_parsing():
    from app.market.massive import MassiveClient

    payload = {
        "tickers": [
            {"ticker": "aapl", "lastTrade": {"p": 191.5}},
            {"ticker": "MSFT", "min": {"c": 420.25}},
            {"ticker": "TSLA", "prevDay": {"c": 250.0}},
            {"ticker": "NOPE"},
        ]
    }
    assert MassiveClient.parse_snapshot(payload) == {
        "AAPL": 191.5,
        "MSFT": 420.25,
        "TSLA": 250.0,
    }
