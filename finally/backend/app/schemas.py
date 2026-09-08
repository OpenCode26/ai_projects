from typing import Literal

from pydantic import BaseModel, Field


class TradeRequest(BaseModel):
    ticker: str
    quantity: float = Field(gt=0)
    side: Literal["buy", "sell"]


class WatchlistRequest(BaseModel):
    ticker: str
