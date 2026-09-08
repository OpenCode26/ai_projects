import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.market.base import Quote
from app.market.service import get_service

router = APIRouter()

# Emitted as an SSE comment when the feed is quiet, so idle proxies don't
# close the connection.
KEEPALIVE_SECONDS = 15.0


def _format(quote: Quote) -> str:
    return f"data: {json.dumps(quote.to_event())}\n\n"


async def _events() -> AsyncIterator[str]:
    service = get_service()
    queue = service.subscribe()
    try:
        yield "retry: 3000\n\n"
        for quote in service.cache.snapshot():
            yield _format(quote)

        while True:
            try:
                quote = await asyncio.wait_for(queue.get(), timeout=KEEPALIVE_SECONDS)
            except TimeoutError:
                yield ": keepalive\n\n"
                continue
            yield _format(quote)
    finally:
        service.unsubscribe(queue)


@router.get("/stream/prices")
async def stream_prices() -> StreamingResponse:
    return StreamingResponse(
        _events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
