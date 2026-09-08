import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app import config, errors
from app.market import service as market
from app.routers import chat, health, portfolio, stream, watchlist
from app.services.portfolio import snapshot_loop
from db.connection import close_connection, get_connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("finally")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_connection()

    service = market.build_service()
    market.set_service(service)
    await service.start()
    logger.info("market data source: %s", service.source_name)

    snapshots = asyncio.create_task(snapshot_loop(), name="portfolio-snapshots")

    yield

    snapshots.cancel()
    try:
        await snapshots
    except asyncio.CancelledError:
        pass
    await service.stop()
    market.set_service(None)
    await close_connection()


app = FastAPI(title="FinAlly", lifespan=lifespan)


errors.register(app)

for router in (
    health.router,
    stream.router,
    portfolio.router,
    watchlist.router,
    chat.router,
):
    app.include_router(router, prefix="/api")


def _mount_frontend() -> None:
    """Mounted last so every /api route wins over the catch-all static mount."""
    if config.STATIC_DIR.is_dir():
        app.mount(
            "/", StaticFiles(directory=config.STATIC_DIR, html=True), name="frontend"
        )
        logger.info("serving frontend from %s", config.STATIC_DIR)
        return

    logger.warning("no frontend build at %s — serving API only", config.STATIC_DIR)

    @app.get("/", include_in_schema=False)
    async def frontend_missing() -> PlainTextResponse:
        return PlainTextResponse(
            "FinAlly backend is running. No frontend build found; API is at /api.",
            status_code=200,
        )


_mount_frontend()
