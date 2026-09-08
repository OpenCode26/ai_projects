"""FinAlly database layer: schema, lazy init, seed data, and DAO helpers.

Typical use from route handlers or background tasks:

    from db import execute_trade, get_positions, TradeValidationError

Every helper initializes the database on first call, so there is nothing to
bootstrap at startup (though `init_db()` is available if you want to warm it).
"""

from .connection import (
    close_connection,
    get_connection,
    get_db_path,
    set_db_path,
    utcnow,
    write_lock,
)
from .dao import (
    DEFAULT_USER_ID,
    EPSILON,
    InvalidTicker,
    TradeValidationError,
    add_to_watchlist,
    apply_trade,
    execute_trade,
    get_cash_balance,
    get_portfolio_state,
    get_position,
    get_positions,
    get_profile,
    get_recent_chat_messages,
    get_snapshots,
    get_trades,
    get_tracked_tickers,
    get_watchlist,
    get_watchlist_rows,
    insert_chat_message,
    insert_snapshot,
    insert_trade,
    is_in_watchlist,
    remove_from_watchlist,
    set_cash_balance,
)
from .seed import DEFAULT_CASH_BALANCE, DEFAULT_WATCHLIST
from .tickers import normalize_ticker, validate_ticker


async def init_db() -> None:
    """Eagerly create the schema and seed data (optional; helpers do it lazily)."""
    await get_connection()


__all__ = [
    "DEFAULT_CASH_BALANCE",
    "DEFAULT_USER_ID",
    "DEFAULT_WATCHLIST",
    "EPSILON",
    "InvalidTicker",
    "TradeValidationError",
    "add_to_watchlist",
    "apply_trade",
    "close_connection",
    "execute_trade",
    "get_cash_balance",
    "get_connection",
    "get_db_path",
    "get_portfolio_state",
    "get_position",
    "get_positions",
    "get_profile",
    "get_recent_chat_messages",
    "get_snapshots",
    "get_trades",
    "get_tracked_tickers",
    "get_watchlist",
    "get_watchlist_rows",
    "init_db",
    "insert_chat_message",
    "insert_snapshot",
    "insert_trade",
    "is_in_watchlist",
    "normalize_ticker",
    "remove_from_watchlist",
    "set_cash_balance",
    "set_db_path",
    "utcnow",
    "validate_ticker",
    "write_lock",
]
