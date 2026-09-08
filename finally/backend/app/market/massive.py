import logging
import os
from collections.abc import Sequence

import httpx

from app.config import MASSIVE_POLL_SECONDS
from app.market.base import MarketDataSource

logger = logging.getLogger("finally.market.massive")

BASE_URL = os.getenv("FINALLY_MASSIVE_BASE_URL") or "https://api.polygon.io"


class MassiveClient(MarketDataSource):
    """Polygon-compatible REST snapshot polling (PLAN §6, stretch goal).

    Tickers the upstream has no quote for are simply omitted from the result;
    the cache keeps their last known price rather than showing a gap.
    """

    name = "massive"

    def __init__(self, api_key: str, poll_seconds: float = MASSIVE_POLL_SECONDS) -> None:
        self._api_key = api_key
        self._poll_seconds = poll_seconds
        self._client = httpx.AsyncClient(base_url=BASE_URL, timeout=10.0)

    @property
    def interval_seconds(self) -> float:
        return self._poll_seconds

    async def poll(self, tickers: Sequence[str]) -> dict[str, float]:
        if not tickers:
            return {}
        response = await self._client.get(
            "/v2/snapshot/locale/us/markets/stocks/tickers",
            params={"tickers": ",".join(tickers), "apiKey": self._api_key},
        )
        response.raise_for_status()
        return self.parse_snapshot(response.json())

    @staticmethod
    def parse_snapshot(payload: dict) -> dict[str, float]:
        prices: dict[str, float] = {}
        for entry in payload.get("tickers") or []:
            ticker = entry.get("ticker")
            if not ticker:
                continue
            price = (
                (entry.get("lastTrade") or {}).get("p")
                or (entry.get("min") or {}).get("c")
                or (entry.get("day") or {}).get("c")
                or (entry.get("prevDay") or {}).get("c")
            )
            if price:
                prices[ticker.upper()] = float(price)
        return prices

    async def aclose(self) -> None:
        await self._client.aclose()
