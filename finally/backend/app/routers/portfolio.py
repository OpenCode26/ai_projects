from fastapi import APIRouter

from app.schemas import TradeRequest
from app.services import portfolio as portfolio_service
from db import dao

router = APIRouter()


@router.get("/portfolio")
async def get_portfolio() -> dict:
    return await portfolio_service.load_portfolio()


@router.get("/portfolio/history")
async def get_portfolio_history() -> dict:
    return {"snapshots": await dao.get_snapshots()}


@router.post("/portfolio/trade")
async def post_trade(request: TradeRequest) -> dict:
    trade = await portfolio_service.execute_trade(
        request.ticker, request.side, request.quantity
    )
    return {
        "trade": {
            "id": trade["id"],
            "ticker": trade["ticker"],
            "side": trade["side"],
            "quantity": trade["quantity"],
            "price": trade["price"],
            "notional": trade["notional"],
            "realized_pnl": trade["realized_pnl"],
            "executed_at": trade["executed_at"],
        },
        "portfolio": await portfolio_service.load_portfolio(),
    }


@router.get("/trades")
async def get_trades() -> dict:
    return {"trades": await dao.get_trades()}
