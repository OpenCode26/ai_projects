from collections.abc import Mapping
from datetime import datetime, timezone

from app.market.base import Quote

PRICE_TOLERANCE = 1e-9


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class PriceCache:
    """Latest price, previous price and timestamp per ticker (PLAN §6).

    Process-local and shared by the market-data loop, the SSE stream and
    portfolio valuation — which is why the app pins a single uvicorn worker
    (§13.1).
    """

    def __init__(self) -> None:
        self._quotes: dict[str, Quote] = {}

    def get(self, ticker: str) -> Quote | None:
        return self._quotes.get(ticker)

    def price(self, ticker: str) -> float | None:
        quote = self._quotes.get(ticker)
        return quote.price if quote else None

    def snapshot(self) -> list[Quote]:
        return list(self._quotes.values())

    def apply(self, prices: Mapping[str, float]) -> list[Quote]:
        """Record new prices and return quotes for the ones that moved."""
        timestamp = _utcnow()
        changed: list[Quote] = []

        for ticker, price in prices.items():
            existing = self._quotes.get(ticker)
            previous = existing.price if existing else price
            open_price = existing.open_price if existing else price

            if existing is not None and abs(price - previous) < PRICE_TOLERANCE:
                continue

            if price > previous + PRICE_TOLERANCE:
                direction = "up"
            elif price < previous - PRICE_TOLERANCE:
                direction = "down"
            else:
                direction = "flat"

            quote = Quote(
                ticker=ticker,
                price=price,
                previous_price=previous,
                timestamp=timestamp,
                direction=direction,
                open_price=open_price,
            )
            self._quotes[ticker] = quote
            changed.append(quote)

        return changed
