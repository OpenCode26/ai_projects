"""Deterministic LLM_MOCK=true responses (PLAN §9, "LLM Mock Mode").

A rule-based matcher, never an LLM call: E2E tests get a stable, assertable
mapping from input text to output JSON.

The rules, applied in order:
  1. a buy/sell keyword + an UPPERCASE ticker -> one `trades` entry
  2. an add/remove keyword + an UPPERCASE ticker -> one `watchlist_changes` entry
  3. anything else -> a canned message with no actions

Only uppercase tokens count as tickers, which is what keeps rule 1 from firing
on ordinary prose. Quantity is the first number in the message, defaulting to 1
(so "sell all my TSLA" sells one share — the matcher has no portfolio access).
"""

import re

from app.llm.schemas import LLMResponse, LLMTrade, LLMWatchlistChange

_TICKER_RE = re.compile(r"\b[A-Z]{1,5}\b")
_QUANTITY_RE = re.compile(r"\d+(?:\.\d+)?")
_BUY_RE = re.compile(r"\b(buy|bought|purchase|long)\b", re.IGNORECASE)
_SELL_RE = re.compile(r"\b(sell|sold|dump|exit|close)\b", re.IGNORECASE)
_ADD_RE = re.compile(r"\b(add|watch|track|follow)\b", re.IGNORECASE)
_REMOVE_RE = re.compile(r"\b(remove|drop|unwatch|untrack|delete)\b", re.IGNORECASE)

# Uppercase words that read as tickers but never are, in practice.
_NOT_TICKERS = frozenset({"I", "A", "AI", "OK", "USD", "ETF", "PNL", "LLM", "FYI"})

GENERIC_MESSAGE = (
    "FinAlly is running in mock mode, so I can't analyze the market right now. "
    "Ask me to buy or sell a ticker, or to add or remove one from your watchlist."
)
NO_TICKER_MESSAGE = (
    "I couldn't tell which ticker you meant. Name it in capitals, "
    "for example \"buy 10 AAPL\"."
)


def _first_ticker(message: str) -> str | None:
    for token in _TICKER_RE.findall(message):
        if token not in _NOT_TICKERS:
            return token
    return None


def _quantity(message: str) -> float:
    match = _QUANTITY_RE.search(message)
    return float(match.group()) if match else 1.0


def mock_response(message: str) -> LLMResponse:
    """Map a user message to a deterministic structured response."""
    text = message or ""

    is_sell = bool(_SELL_RE.search(text))
    is_buy = bool(_BUY_RE.search(text))
    if is_buy or is_sell:
        ticker = _first_ticker(text)
        if ticker is None:
            return LLMResponse(message=NO_TICKER_MESSAGE)
        side = "sell" if is_sell else "buy"
        quantity = _quantity(text)
        return LLMResponse(
            message=(
                f"Placing a market order to {side} {quantity:g} {ticker} "
                "at the current price."
            ),
            trades=[LLMTrade(ticker=ticker, side=side, quantity=quantity)],
        )

    is_remove = bool(_REMOVE_RE.search(text))
    if is_remove or _ADD_RE.search(text):
        ticker = _first_ticker(text)
        if ticker is None:
            return LLMResponse(message=NO_TICKER_MESSAGE)
        action = "remove" if is_remove else "add"
        preposition = "from" if is_remove else "to"
        return LLMResponse(
            message=f"{action.capitalize()}ing {ticker} {preposition} your watchlist.",
            watchlist_changes=[
                LLMWatchlistChange(ticker=ticker, action=action)
            ],
        )

    return LLMResponse(message=GENERIC_MESSAGE)
