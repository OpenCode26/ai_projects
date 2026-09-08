import hashlib
from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class Quote:
    ticker: str
    price: float
    previous_price: float
    timestamp: str
    direction: str  # "up" | "down" | "flat"
    open_price: float  # first price seen this session; the change-% baseline

    @property
    def change(self) -> float:
        return self.price - self.open_price

    @property
    def change_pct(self) -> float:
        if not self.open_price:
            return 0.0
        return (self.price - self.open_price) / self.open_price * 100

    def to_event(self) -> dict:
        return {
            "ticker": self.ticker,
            "price": round(self.price, 4),
            "previous_price": round(self.previous_price, 4),
            "open_price": round(self.open_price, 4),
            "change": round(self.change, 4),
            "change_pct": round(self.change_pct, 4),
            "timestamp": self.timestamp,
            "direction": self.direction,
        }


def seed_price(ticker: str) -> float:
    """Deterministic $10-$500 seed price for an unknown ticker (PLAN §13.4).

    Uses a stable digest rather than `hash()`, whose string hashing is salted
    per process and would give a ticker a different seed on every restart.
    """
    digest = hashlib.sha256(ticker.encode()).hexdigest()
    return float(10 + (int(digest[:8], 16) % 490))


class MarketDataSource(ABC):
    """Produces current prices for a set of tickers (PLAN §6).

    The simulator advances its own model on each call; the Massive client polls
    a REST API. Everything downstream — price cache, SSE, frontend — is
    agnostic to which is in use.
    """

    name: str

    @abstractmethod
    async def poll(self, tickers: Sequence[str]) -> dict[str, float]:
        """Return the current price for each requested ticker."""

    @property
    @abstractmethod
    def interval_seconds(self) -> float:
        """How long the driving loop should wait between `poll` calls."""

    async def aclose(self) -> None:
        """Release any resources held by the source."""
