"""System prompt and portfolio-context construction (PLAN §9 steps 1-3)."""

from typing import Any

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant embedded in a \
simulated trading workstation. The user trades a virtual $10,000 portfolio; \
there is no real money at stake.

Your job:
- Analyze portfolio composition, risk concentration, and P&L.
- Suggest trades, always with a short, concrete reason.
- Execute trades when the user asks for them or agrees to your suggestion.
- Manage the watchlist proactively when it helps the conversation.

Rules:
- Be concise and data-driven. Reference actual numbers from the portfolio \
context; never invent prices or positions.
- Only market orders exist: a trade is a ticker, a side (buy or sell), and a \
quantity. Fractional quantities are allowed.
- Put a trade in `trades` ONLY when the user has asked for it or agreed to it. \
Merely discussing or recommending an idea is not consent — describe it in \
`message` instead and wait.
- Anything you place in `trades` or `watchlist_changes` is executed \
immediately and automatically, with no confirmation step.
- The trades you propose are validated before they fill: buys need sufficient \
cash and sells need sufficient shares. Do not propose trades the context \
shows the user cannot afford.
- `message` is the only text the user sees, so state there what you did.
- Always respond with valid structured JSON matching the required schema."""

_NO_POSITIONS = "  (no open positions — the portfolio is all cash)"
_NO_WATCHLIST = "  (watchlist is empty)"


def _money(value: Any) -> str:
    return f"${float(value or 0.0):,.2f}"


def _format_positions(positions: list[dict[str, Any]]) -> str:
    if not positions:
        return _NO_POSITIONS
    lines = []
    for p in positions:
        pnl = float(p.get("unrealized_pnl") or 0.0)
        lines.append(
            f"  {p.get('ticker')}: {float(p.get('quantity') or 0.0):g} shares @ "
            f"avg cost {_money(p.get('avg_cost'))}, "
            f"current {_money(p.get('current_price'))}, "
            f"value {_money(p.get('market_value'))}, "
            f"unrealized P&L {'+' if pnl >= 0 else '-'}{_money(abs(pnl))} "
            f"({float(p.get('unrealized_pnl_pct') or 0.0):+.2f}%)"
        )
    return "\n".join(lines)


def _format_watchlist(items: list[dict[str, Any]]) -> str:
    if not items:
        return _NO_WATCHLIST
    lines = []
    for item in items:
        if item.get("price") is None:
            # Never render an unquoted ticker as $0.00 — the model would treat
            # that as a real price and reason from it.
            lines.append(f"  {item.get('ticker')}: awaiting first quote")
            continue
        lines.append(
            f"  {item.get('ticker')}: {_money(item.get('price'))} "
            f"({float(item.get('change_pct') or 0.0):+.2f}%)"
        )
    return "\n".join(lines)


def build_portfolio_context(
    portfolio: dict[str, Any], watchlist: dict[str, Any]
) -> str:
    """Render live portfolio + watchlist state as prompt text (§9 step 1)."""
    positions = portfolio.get("positions") or []
    items = watchlist.get("watchlist") or []
    total_pnl = float(portfolio.get("unrealized_pnl") or 0.0)

    return (
        "CURRENT PORTFOLIO STATE\n"
        f"Cash available: {_money(portfolio.get('cash_balance'))}\n"
        f"Positions value: {_money(portfolio.get('positions_value'))}\n"
        f"Total portfolio value: {_money(portfolio.get('total_value'))}\n"
        f"Total unrealized P&L: {'+' if total_pnl >= 0 else '-'}"
        f"{_money(abs(total_pnl))}\n"
        f"\nPOSITIONS\n{_format_positions(positions)}\n"
        f"\nWATCHLIST (live prices)\n{_format_watchlist(items)}"
    )


def build_messages(
    user_message: str,
    context: str,
    history: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Assemble system + context + capped history + new message (§9 steps 2-3)."""
    messages: list[dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context},
    ]
    for entry in history:
        role = entry.get("role")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": entry.get("content") or ""})
    messages.append({"role": "user", "content": user_message})
    return messages
