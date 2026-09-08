"""Data access helpers for FinAlly (PLAN.md §7, §8, §13.8).

Every helper normalizes tickers to uppercase and lazily initializes the
database, so callers never need to bootstrap anything themselves.

Two entry points write a trade, sharing one transaction primitive:

* `apply_trade(...)` — persistence only. The caller has already done the
  validation and cost-basis math and passes the resulting state.
* `execute_trade(...)` — validation, cost basis, and persistence together.

Pick one per code path; they must not be layered on top of each other.
"""

import json
import uuid
from typing import Any

import aiosqlite

from .connection import get_connection, utcnow, write_lock
from .tickers import DEFAULT_USER_ID, InvalidTicker, validate_ticker

# §13.8: absorb float drift from repeated fractional trades.
EPSILON = 1e-6


class TradeValidationError(ValueError):
    """A trade failed validation. `str(e)` is user-facing (§8 error shape)."""


def _row_to_dict(row: aiosqlite.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def _normalize_side(side: str) -> str:
    normalized = str(side).strip().lower()
    if normalized not in ("buy", "sell"):
        raise TradeValidationError(
            f"Invalid side '{side}': must be 'buy' or 'sell'"
        )
    return normalized


# --------------------------------------------------------------------------
# Profile / cash
# --------------------------------------------------------------------------


async def get_profile(user_id: str = DEFAULT_USER_ID) -> dict[str, Any] | None:
    conn = await get_connection()
    async with conn.execute(
        "SELECT id, cash_balance, created_at FROM users_profile WHERE id = ?",
        (user_id,),
    ) as cursor:
        return _row_to_dict(await cursor.fetchone())


async def get_cash_balance(user_id: str = DEFAULT_USER_ID) -> float:
    profile = await get_profile(user_id)
    return float(profile["cash_balance"]) if profile else 0.0


async def set_cash_balance(balance: float, user_id: str = DEFAULT_USER_ID) -> float:
    conn = await get_connection()
    async with write_lock():
        await conn.execute(
            "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
            (float(balance), user_id),
        )
        await conn.commit()
    return float(balance)


# --------------------------------------------------------------------------
# Watchlist
# --------------------------------------------------------------------------


async def get_watchlist_rows(
    user_id: str = DEFAULT_USER_ID,
) -> list[dict[str, Any]]:
    """Full watchlist rows (id, ticker, added_at) in the order they were added."""
    conn = await get_connection()
    async with conn.execute(
        "SELECT id, user_id, ticker, added_at FROM watchlist WHERE user_id = ?"
        " ORDER BY added_at, rowid",
        (user_id,),
    ) as cursor:
        return [dict(row) for row in await cursor.fetchall()]


async def get_watchlist(user_id: str = DEFAULT_USER_ID) -> list[str]:
    """Watchlist symbols, in the order they were added."""
    return [row["ticker"] for row in await get_watchlist_rows(user_id)]


async def is_in_watchlist(ticker: str, user_id: str = DEFAULT_USER_ID) -> bool:
    conn = await get_connection()
    async with conn.execute(
        "SELECT 1 FROM watchlist WHERE user_id = ? AND ticker = ?",
        (user_id, validate_ticker(ticker)),
    ) as cursor:
        return await cursor.fetchone() is not None


async def add_to_watchlist(
    ticker: str, user_id: str = DEFAULT_USER_ID
) -> bool:
    """Add a ticker. Returns False if it was already present (never raises on dup)."""
    symbol = validate_ticker(ticker)
    conn = await get_connection()
    async with write_lock():
        cursor = await conn.execute(
            "INSERT OR IGNORE INTO watchlist (id, user_id, ticker, added_at)"
            " VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, symbol, utcnow()),
        )
        await conn.commit()
        return cursor.rowcount > 0


async def remove_from_watchlist(
    ticker: str, user_id: str = DEFAULT_USER_ID
) -> bool:
    """Remove a ticker. Returns False if it was not present.

    Any open position in the ticker is deliberately left untouched (§8).
    """
    symbol = validate_ticker(ticker)
    conn = await get_connection()
    async with write_lock():
        cursor = await conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?",
            (user_id, symbol),
        )
        await conn.commit()
        return cursor.rowcount > 0


# --------------------------------------------------------------------------
# Positions
# --------------------------------------------------------------------------


async def get_positions(user_id: str = DEFAULT_USER_ID) -> list[dict[str, Any]]:
    conn = await get_connection()
    async with conn.execute(
        "SELECT id, user_id, ticker, quantity, avg_cost, updated_at"
        " FROM positions WHERE user_id = ? ORDER BY ticker",
        (user_id,),
    ) as cursor:
        return [dict(row) for row in await cursor.fetchall()]


async def get_position(
    ticker: str, user_id: str = DEFAULT_USER_ID
) -> dict[str, Any] | None:
    conn = await get_connection()
    async with conn.execute(
        "SELECT id, user_id, ticker, quantity, avg_cost, updated_at"
        " FROM positions WHERE user_id = ? AND ticker = ?",
        (user_id, validate_ticker(ticker)),
    ) as cursor:
        return _row_to_dict(await cursor.fetchone())


async def get_tracked_tickers(user_id: str = DEFAULT_USER_ID) -> list[str]:
    """Watchlist ∪ open positions — the set the price feed must cover (§6)."""
    conn = await get_connection()
    async with conn.execute(
        "SELECT ticker FROM watchlist WHERE user_id = ?"
        " UNION SELECT ticker FROM positions WHERE user_id = ?"
        " ORDER BY ticker",
        (user_id, user_id),
    ) as cursor:
        return [row["ticker"] for row in await cursor.fetchall()]


async def get_portfolio_state(user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
    """Cash and positions read together, with no trade able to land between them.

    All writes go through the same write lock, so holding it here makes the
    pair a consistent snapshot for portfolio valuation.
    """
    async with write_lock():
        return {
            "cash_balance": await get_cash_balance(user_id),
            "positions": await get_positions(user_id),
        }


# --------------------------------------------------------------------------
# Trades
# --------------------------------------------------------------------------


async def _persist_position(
    conn: aiosqlite.Connection,
    symbol: str,
    new_quantity: float,
    new_avg_cost: float,
    user_id: str,
) -> None:
    """Write the resulting position, deleting it once it rounds to flat (§13.8)."""
    if new_quantity <= EPSILON:
        await conn.execute(
            "DELETE FROM positions WHERE user_id = ? AND ticker = ?",
            (user_id, symbol),
        )
        return
    await conn.execute(
        "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?)"
        " ON CONFLICT (user_id, ticker) DO UPDATE SET"
        " quantity = excluded.quantity, avg_cost = excluded.avg_cost,"
        " updated_at = excluded.updated_at",
        (
            str(uuid.uuid4()),
            user_id,
            symbol,
            new_quantity,
            new_avg_cost,
            utcnow(),
        ),
    )


async def _write_trade(
    conn: aiosqlite.Connection,
    symbol: str,
    side: str,
    quantity: float,
    price: float,
    new_cash_balance: float,
    new_quantity: float,
    new_avg_cost: float,
    user_id: str,
) -> dict[str, Any]:
    """Cash + position + trade log in one transaction. Caller holds the write lock."""
    try:
        await conn.execute(
            "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
            (new_cash_balance, user_id),
        )
        await _persist_position(conn, symbol, new_quantity, new_avg_cost, user_id)

        trade = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "ticker": symbol,
            "side": side,
            "quantity": quantity,
            "price": price,
            "executed_at": utcnow(),
        }
        await conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price,"
            " executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                trade["id"],
                user_id,
                symbol,
                side,
                quantity,
                price,
                trade["executed_at"],
            ),
        )
        await conn.commit()
        return trade
    except BaseException:
        await conn.rollback()
        raise


async def apply_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    new_cash_balance: float,
    new_quantity: float,
    new_avg_cost: float,
    user_id: str = DEFAULT_USER_ID,
) -> dict[str, Any]:
    """Persist an already-validated trade atomically; returns the trade row.

    Performs no validation beyond ticker and side: the caller owns the
    cost-basis math and passes the resulting state. The position row is
    deleted when `new_quantity` is within EPSILON of zero.
    """
    symbol = validate_ticker(ticker)
    side = _normalize_side(side)
    conn = await get_connection()
    async with write_lock():
        return await _write_trade(
            conn,
            symbol,
            side,
            float(quantity),
            float(price),
            float(new_cash_balance),
            float(new_quantity),
            float(new_avg_cost),
            user_id,
        )


async def execute_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    user_id: str = DEFAULT_USER_ID,
) -> dict[str, Any]:
    """Validate and atomically apply a market order.

    Weighted-average cost basis on buys, quantity-only on sells (§7). Raises
    TradeValidationError with a user-facing message on insufficient
    cash/shares, or InvalidTicker on a malformed symbol. Nothing is persisted
    when it raises.
    """
    symbol = validate_ticker(ticker)
    side = _normalize_side(side)
    quantity = float(quantity)
    price = float(price)

    if quantity <= EPSILON:
        raise TradeValidationError("Quantity must be greater than zero")
    if price <= 0:
        raise TradeValidationError(f"No valid price available for {symbol}")

    notional = quantity * price
    conn = await get_connection()

    async with write_lock():
        cash = await get_cash_balance(user_id)
        position = await get_position(symbol, user_id)
        held = float(position["quantity"]) if position else 0.0
        avg_cost = float(position["avg_cost"]) if position else 0.0
        realized_pnl = None

        if side == "buy":
            if notional > cash + EPSILON:
                raise TradeValidationError(
                    f"Insufficient cash: {symbol} buy costs ${notional:,.2f} "
                    f"but only ${cash:,.2f} is available"
                )
            new_cash = cash - notional
            new_quantity = held + quantity
            new_avg_cost = (held * avg_cost + quantity * price) / new_quantity
        else:
            if quantity > held + EPSILON:
                raise TradeValidationError(
                    f"Insufficient shares: you hold {held:g} {symbol}, "
                    f"cannot sell {quantity:g}"
                )
            new_cash = cash + notional
            new_quantity = held - quantity
            new_avg_cost = avg_cost  # sells never move the cost basis (§7)
            realized_pnl = (price - avg_cost) * quantity

        trade = await _write_trade(
            conn,
            symbol,
            side,
            quantity,
            price,
            new_cash,
            new_quantity,
            new_avg_cost,
            user_id,
        )

    trade["notional"] = notional
    trade["cash_balance"] = new_cash
    trade["realized_pnl"] = realized_pnl
    trade["position"] = await get_position(symbol, user_id)
    return trade


async def insert_trade(
    ticker: str,
    side: str,
    quantity: float,
    price: float,
    user_id: str = DEFAULT_USER_ID,
) -> dict[str, Any]:
    """Append a row to the trade log without touching cash or positions."""
    trade = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "ticker": validate_ticker(ticker),
        "side": _normalize_side(side),
        "quantity": float(quantity),
        "price": float(price),
        "executed_at": utcnow(),
    }
    conn = await get_connection()
    async with write_lock():
        await conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price,"
            " executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            tuple(
                trade[k]
                for k in (
                    "id",
                    "user_id",
                    "ticker",
                    "side",
                    "quantity",
                    "price",
                    "executed_at",
                )
            ),
        )
        await conn.commit()
    return trade


async def get_trades(
    user_id: str = DEFAULT_USER_ID, limit: int | None = None
) -> list[dict[str, Any]]:
    """Trade log, most recent first (§13.5)."""
    conn = await get_connection()
    sql = (
        "SELECT id, user_id, ticker, side, quantity, price, executed_at"
        " FROM trades WHERE user_id = ? ORDER BY executed_at DESC, rowid DESC"
    )
    params: tuple[Any, ...] = (user_id,)
    if limit is not None:
        sql += " LIMIT ?"
        params += (int(limit),)
    async with conn.execute(sql, params) as cursor:
        return [dict(row) for row in await cursor.fetchall()]


# --------------------------------------------------------------------------
# Portfolio snapshots
# --------------------------------------------------------------------------


async def insert_snapshot(
    total_value: float, user_id: str = DEFAULT_USER_ID
) -> dict[str, Any]:
    snapshot = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "total_value": float(total_value),
        "recorded_at": utcnow(),
    }
    conn = await get_connection()
    async with write_lock():
        await conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at)"
            " VALUES (?, ?, ?, ?)",
            (
                snapshot["id"],
                user_id,
                snapshot["total_value"],
                snapshot["recorded_at"],
            ),
        )
        await conn.commit()
    return snapshot


async def get_snapshots(
    user_id: str = DEFAULT_USER_ID, limit: int | None = None
) -> list[dict[str, Any]]:
    """Snapshots oldest-first, ready to plot. `limit` keeps the newest N."""
    conn = await get_connection()
    if limit is None:
        async with conn.execute(
            "SELECT id, user_id, total_value, recorded_at FROM portfolio_snapshots"
            " WHERE user_id = ? ORDER BY recorded_at, rowid",
            (user_id,),
        ) as cursor:
            return [dict(row) for row in await cursor.fetchall()]

    async with conn.execute(
        "SELECT id, user_id, total_value, recorded_at FROM portfolio_snapshots"
        " WHERE user_id = ? ORDER BY recorded_at DESC, rowid DESC LIMIT ?",
        (user_id, int(limit)),
    ) as cursor:
        rows = [dict(row) for row in await cursor.fetchall()]
    return list(reversed(rows))


# --------------------------------------------------------------------------
# Chat messages
# --------------------------------------------------------------------------


async def insert_chat_message(
    role: str,
    content: str,
    actions: Any = None,
    user_id: str = DEFAULT_USER_ID,
) -> dict[str, Any]:
    """Append a chat message.

    `actions` may be a dict/list (JSON-serialized here), a pre-serialized
    string, or None for user messages.
    """
    role = str(role).strip().lower()
    if role not in ("user", "assistant"):
        raise ValueError(f"Invalid role '{role}': must be 'user' or 'assistant'")

    actions_json = (
        actions if actions is None or isinstance(actions, str) else json.dumps(actions)
    )
    message = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "role": role,
        "content": content,
        "actions": actions_json,
        "created_at": utcnow(),
    }
    conn = await get_connection()
    async with write_lock():
        await conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions,"
            " created_at) VALUES (?, ?, ?, ?, ?, ?)",
            tuple(
                message[k]
                for k in ("id", "user_id", "role", "content", "actions", "created_at")
            ),
        )
        await conn.commit()
    return message


async def get_recent_chat_messages(
    user_id: str = DEFAULT_USER_ID, limit: int = 20
) -> list[dict[str, Any]]:
    """The most recent `limit` messages, oldest-first, with `actions` decoded (§9)."""
    conn = await get_connection()
    async with conn.execute(
        "SELECT id, user_id, role, content, actions, created_at FROM chat_messages"
        " WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
        (user_id, int(limit)),
    ) as cursor:
        rows = [dict(row) for row in await cursor.fetchall()]
    for row in rows:
        if row["actions"]:
            try:
                row["actions"] = json.loads(row["actions"])
            except json.JSONDecodeError:
                pass
    return list(reversed(rows))


async def get_all_chat_messages(
    user_id: str = DEFAULT_USER_ID,
) -> list[dict[str, Any]]:
    """Full chat log, oldest first, with `actions` decoded (§13.13)."""
    conn = await get_connection()
    async with conn.execute(
        "SELECT id, user_id, role, content, actions, created_at FROM chat_messages"
        " WHERE user_id = ? ORDER BY created_at, rowid",
        (user_id,),
    ) as cursor:
        rows = [dict(row) for row in await cursor.fetchall()]
    for row in rows:
        if row["actions"]:
            try:
                row["actions"] = json.loads(row["actions"])
            except json.JSONDecodeError:
                pass
    return rows


__all__ = [
    "EPSILON",
    "DEFAULT_USER_ID",
    "InvalidTicker",
    "TradeValidationError",
    "add_to_watchlist",
    "apply_trade",
    "execute_trade",
    "get_all_chat_messages",
    "get_cash_balance",
    "get_portfolio_state",
    "get_position",
    "get_positions",
    "get_profile",
    "get_recent_chat_messages",
    "get_snapshots",
    "get_tracked_tickers",
    "get_trades",
    "get_watchlist",
    "get_watchlist_rows",
    "insert_chat_message",
    "insert_snapshot",
    "insert_trade",
    "is_in_watchlist",
    "remove_from_watchlist",
    "set_cash_balance",
]
