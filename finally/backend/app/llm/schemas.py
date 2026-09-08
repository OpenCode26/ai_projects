"""Pydantic models for the chat API and the LLM structured output (PLAN §9)."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class LLMTrade(BaseModel):
    ticker: str
    side: Literal["buy", "sell"]
    quantity: float


class LLMWatchlistChange(BaseModel):
    ticker: str
    action: Literal["add", "remove"]


class LLMResponse(BaseModel):
    """The structured output the model is required to produce (§9)."""

    message: str
    trades: list[LLMTrade] = Field(default_factory=list)
    watchlist_changes: list[LLMWatchlistChange] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str


class ExecutedTrade(BaseModel):
    """Outcome of one LLM-proposed trade. `status` drives the inline UI badge."""

    ticker: str
    side: str
    quantity: float
    status: Literal["executed", "failed", "skipped"]
    price: float | None = None
    notional: float | None = None
    realized_pnl: float | None = None
    error: str | None = None


class ExecutedWatchlistChange(BaseModel):
    ticker: str
    action: str
    status: Literal["executed", "unchanged", "failed"]
    error: str | None = None


class ChatResponse(BaseModel):
    """§13.6: post-execution portfolio/watchlist ride along on mutating turns."""

    message: str
    trades: list[ExecutedTrade] = Field(default_factory=list)
    watchlist_changes: list[ExecutedWatchlistChange] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    portfolio: dict[str, Any] | None = None
    watchlist: dict[str, Any] | None = None
