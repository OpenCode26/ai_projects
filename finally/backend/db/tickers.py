"""Ticker normalization and validation (PLAN.md §7, §13.4)."""

import re

_TICKER_RE = re.compile(r"^[A-Z0-9]{1,5}$")

DEFAULT_USER_ID = "default"


class InvalidTicker(ValueError):
    """Raised when a ticker string fails validation."""


def normalize_ticker(ticker: str) -> str:
    """Uppercase and strip a ticker without validating it."""
    return str(ticker).strip().upper()


def validate_ticker(ticker: str) -> str:
    """Return the normalized ticker, or raise InvalidTicker."""
    normalized = normalize_ticker(ticker)
    if not _TICKER_RE.match(normalized):
        raise InvalidTicker(
            f"Invalid ticker '{ticker}': must be 1-5 alphanumeric characters"
        )
    return normalized
