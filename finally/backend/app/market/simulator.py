import math
import random
from collections.abc import Sequence

from app import config
from app.market.base import MarketDataSource, seed_price

# Realistic starting prices for the default watchlist (PLAN §6).
SEED_PRICES: dict[str, float] = {
    "AAPL": 190.0,
    "GOOGL": 175.0,
    "MSFT": 420.0,
    "AMZN": 185.0,
    "TSLA": 250.0,
    "NVDA": 880.0,
    "META": 500.0,
    "JPM": 200.0,
    "V": 280.0,
    "NFLX": 610.0,
}

SECTORS: dict[str, str] = {
    "AAPL": "tech",
    "GOOGL": "tech",
    "MSFT": "tech",
    "AMZN": "tech",
    "NVDA": "tech",
    "META": "tech",
    "NFLX": "tech",
    "TSLA": "auto",
    "JPM": "finance",
    "V": "finance",
}

# Annualized drift/volatility. Unlisted tickers fall back to these.
DEFAULT_DRIFT = 0.05
DEFAULT_VOLATILITY = 0.35
VOLATILITY: dict[str, float] = {
    "TSLA": 0.65,
    "NVDA": 0.60,
    "META": 0.42,
    "NFLX": 0.45,
    "JPM": 0.24,
    "V": 0.22,
    "MSFT": 0.28,
    "AAPL": 0.30,
}

# One tick stands in for one minute of market time, so half a second of
# wall-clock produces a visible move instead of an invisible sub-basis-point
# one. 252 trading days x 390 minutes.
MINUTES_PER_YEAR = 252 * 390
DT = 1.0 / MINUTES_PER_YEAR

# Factor loadings: a name follows the whole market, its sector, and itself.
# Squares sum to well under 1, leaving room for idiosyncratic variance; these
# put same-sector correlation near 0.56, so tech visibly moves together.
MARKET_BETA = 0.60
SECTOR_BETA = 0.45

EVENT_PROBABILITY = 0.002  # per ticker per tick
EVENT_MIN, EVENT_MAX = 0.02, 0.05

MIN_PRICE = 0.01


class MarketSimulator(MarketDataSource):
    """Correlated geometric Brownian motion with occasional shock events."""

    name = "simulator"

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()
        self._prices: dict[str, float] = {}

    @property
    def interval_seconds(self) -> float:
        return config.PRICE_TICK_SECONDS

    def _ensure_seeded(self, ticker: str) -> None:
        if ticker not in self._prices:
            self._prices[ticker] = SEED_PRICES.get(ticker) or seed_price(ticker)

    async def poll(self, tickers: Sequence[str]) -> dict[str, float]:
        return self.step(tickers)

    def step(self, tickers: Sequence[str]) -> dict[str, float]:
        """Advance every ticker one tick and return the new prices."""
        market_shock = self._rng.gauss(0.0, 1.0)
        sector_shocks: dict[str, float] = {}

        prices: dict[str, float] = {}
        for ticker in tickers:
            self._ensure_seeded(ticker)

            sector = SECTORS.get(ticker, "other")
            if sector not in sector_shocks:
                sector_shocks[sector] = self._rng.gauss(0.0, 1.0)

            # Unit-variance blend of market, sector and idiosyncratic shocks.
            idio_weight = math.sqrt(max(0.0, 1.0 - MARKET_BETA**2 - SECTOR_BETA**2))
            shock = (
                MARKET_BETA * market_shock
                + SECTOR_BETA * sector_shocks[sector]
                + idio_weight * self._rng.gauss(0.0, 1.0)
            )

            sigma = VOLATILITY.get(ticker, DEFAULT_VOLATILITY)
            drift = (DEFAULT_DRIFT - 0.5 * sigma**2) * DT
            diffusion = sigma * math.sqrt(DT) * shock
            price = self._prices[ticker] * math.exp(drift + diffusion)

            if self._rng.random() < EVENT_PROBABILITY:
                magnitude = self._rng.uniform(EVENT_MIN, EVENT_MAX)
                price *= 1 + magnitude * self._rng.choice((1, -1))

            price = max(MIN_PRICE, price)
            self._prices[ticker] = price
            prices[ticker] = price

        return prices
