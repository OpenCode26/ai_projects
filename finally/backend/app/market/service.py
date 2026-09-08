import asyncio
import logging

from app import config
from app.market.base import MarketDataSource, Quote
from app.market.cache import PriceCache
from app.market.simulator import MarketSimulator
from db import dao

logger = logging.getLogger("finally.market")

# How often the tracked-ticker set is re-read from the database. Mutations
# (watchlist add, buy) call `track()` for immediate coverage, so this only
# needs to catch drops.
TRACKED_REFRESH_SECONDS = 5.0

# Bounded so a stalled SSE client can't grow the process without limit.
SUBSCRIBER_QUEUE_SIZE = 512


class MarketDataService:
    """Drives the price feed and fans updates out to SSE subscribers (§6)."""

    def __init__(self, source: MarketDataSource, cache: PriceCache) -> None:
        self._source = source
        self._cache = cache
        self._subscribers: set[asyncio.Queue[Quote]] = set()
        self._tracked: set[str] = set()
        self._task: asyncio.Task | None = None
        self._since_refresh = TRACKED_REFRESH_SECONDS

    @property
    def cache(self) -> PriceCache:
        return self._cache

    @property
    def source_name(self) -> str:
        return self._source.name

    async def start(self) -> None:
        await self._refresh_tracked()
        self._task = asyncio.create_task(self._run(), name="market-data")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await self._source.aclose()

    def track(self, ticker: str) -> None:
        """Cover a ticker immediately, ahead of the next database refresh."""
        self._tracked.add(ticker)

    def subscribe(self) -> asyncio.Queue[Quote]:
        queue: asyncio.Queue[Quote] = asyncio.Queue(maxsize=SUBSCRIBER_QUEUE_SIZE)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Quote]) -> None:
        self._subscribers.discard(queue)

    async def ensure_quote(self, ticker: str) -> Quote | None:
        """Price a ticker the feed hasn't covered yet, so a trade can fill."""
        self.track(ticker)
        cached = self._cache.get(ticker)
        if cached is not None:
            return cached
        prices = await self._source.poll([ticker])
        self._publish(self._cache.apply(prices))
        return self._cache.get(ticker)

    async def _refresh_tracked(self) -> None:
        self._tracked = set(await dao.get_tracked_tickers())

    def _publish(self, quotes: list[Quote]) -> None:
        for queue in self._subscribers:
            for quote in quotes:
                try:
                    queue.put_nowait(quote)
                except asyncio.QueueFull:
                    # Drop the oldest update rather than the connection: a
                    # stale price is worth less than the newest one anyway.
                    try:
                        queue.get_nowait()
                        queue.put_nowait(quote)
                    except (asyncio.QueueEmpty, asyncio.QueueFull):
                        pass

    async def _run(self) -> None:
        interval = self._source.interval_seconds
        while True:
            try:
                self._since_refresh += interval
                if self._since_refresh >= TRACKED_REFRESH_SECONDS:
                    self._since_refresh = 0.0
                    await self._refresh_tracked()

                if self._tracked:
                    prices = await self._source.poll(sorted(self._tracked))
                    self._publish(self._cache.apply(prices))
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("market data tick failed")

            await asyncio.sleep(interval)


_service: MarketDataService | None = None


def build_service() -> MarketDataService:
    if config.use_massive():
        from app.market.massive import MassiveClient

        source: MarketDataSource = MassiveClient(config.MASSIVE_API_KEY)
    else:
        source = MarketSimulator()
    return MarketDataService(source, PriceCache())


def set_service(service: MarketDataService | None) -> None:
    global _service
    _service = service


def get_service() -> MarketDataService:
    if _service is None:
        raise RuntimeError("market data service is not running")
    return _service
