from fastapi import APIRouter

from app.errors import NotFound
from app.schemas import WatchlistRequest
from app.services import portfolio as portfolio_service

router = APIRouter()


@router.get("/watchlist")
async def get_watchlist() -> dict:
    return await portfolio_service.load_watchlist()


@router.post("/watchlist")
async def post_watchlist(request: WatchlistRequest) -> dict:
    added = await portfolio_service.add_to_watchlist(request.ticker)
    return {"added": added, **await portfolio_service.load_watchlist()}


@router.delete("/watchlist/{ticker}")
async def delete_watchlist(ticker: str) -> dict:
    if not await portfolio_service.remove_from_watchlist(ticker):
        raise NotFound(f"{ticker.strip().upper()} is not on the watchlist")
    return {"removed": True, **await portfolio_service.load_watchlist()}
