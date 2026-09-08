"""The LLM_MOCK matcher must be deterministic — E2E tests assert on it (§9)."""

import pytest

from app.llm.mock import GENERIC_MESSAGE, NO_TICKER_MESSAGE, mock_response


@pytest.mark.parametrize(
    "message,ticker,side,quantity",
    [
        ("buy 10 AAPL", "AAPL", "buy", 10),
        ("Buy 2.5 NVDA please", "NVDA", "buy", 2.5),
        ("sell 3 TSLA", "TSLA", "sell", 3),
        ("sell all my TSLA", "TSLA", "sell", 1),
        ("I want to buy V", "V", "buy", 1),
    ],
)
def test_trade_intent(message, ticker, side, quantity):
    response = mock_response(message)
    assert len(response.trades) == 1
    trade = response.trades[0]
    assert (trade.ticker, trade.side, trade.quantity) == (ticker, side, quantity)
    assert response.watchlist_changes == []
    assert response.message


@pytest.mark.parametrize(
    "message,ticker,action",
    [
        ("add PYPL to my watchlist", "PYPL", "add"),
        ("please track SHOP", "SHOP", "add"),
        ("remove NFLX from the watchlist", "NFLX", "remove"),
        ("drop JPM", "JPM", "remove"),
    ],
)
def test_watchlist_intent(message, ticker, action):
    response = mock_response(message)
    assert len(response.watchlist_changes) == 1
    change = response.watchlist_changes[0]
    assert (change.ticker, change.action) == (ticker, action)
    assert response.trades == []


def test_sell_wins_over_buy_when_both_present():
    assert mock_response("sell AAPL and buy nothing").trades[0].side == "sell"


def test_trade_intent_beats_watchlist_intent():
    response = mock_response("buy 5 AAPL and add it to my watchlist")
    assert len(response.trades) == 1
    assert response.watchlist_changes == []


@pytest.mark.parametrize(
    "message",
    ["how is my portfolio doing?", "what should I do next?", ""],
)
def test_generic_fallback(message):
    response = mock_response(message)
    assert response.message == GENERIC_MESSAGE
    assert response.trades == []
    assert response.watchlist_changes == []


def test_lowercase_words_are_not_tickers():
    assert mock_response("buy some shares").message == NO_TICKER_MESSAGE


def test_pronouns_are_not_tickers():
    response = mock_response("I want to buy MSFT")
    assert response.trades[0].ticker == "MSFT"


def test_is_deterministic():
    assert mock_response("buy 10 AAPL") == mock_response("buy 10 AAPL")
