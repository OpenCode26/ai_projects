"""Portfolio snapshots and chat history DAO (PLAN.md §7, §9)."""

import pytest


async def test_snapshots_returned_oldest_first(fresh_db):
    await fresh_db.insert_snapshot(10500.0)
    await fresh_db.insert_snapshot(10250.0)

    values = [s["total_value"] for s in await fresh_db.get_snapshots()]
    assert values == [10000.0, 10500.0, 10250.0]


async def test_snapshot_limit_keeps_newest_but_stays_chronological(fresh_db):
    for value in (10100.0, 10200.0, 10300.0):
        await fresh_db.insert_snapshot(value)

    values = [s["total_value"] for s in await fresh_db.get_snapshots(limit=2)]
    assert values == [10200.0, 10300.0]


async def test_chat_messages_roundtrip_actions_as_json(fresh_db):
    await fresh_db.insert_chat_message("user", "buy 5 AAPL")
    actions = {"trades": [{"ticker": "AAPL", "side": "buy", "quantity": 5}]}
    await fresh_db.insert_chat_message("assistant", "Bought 5 AAPL.", actions)

    messages = await fresh_db.get_recent_chat_messages()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["actions"] is None
    assert messages[1]["actions"] == actions


async def test_chat_history_capped_to_most_recent_and_chronological(fresh_db):
    for i in range(25):
        await fresh_db.insert_chat_message("user", f"message {i}")

    messages = await fresh_db.get_recent_chat_messages(limit=20)
    assert len(messages) == 20
    assert messages[0]["content"] == "message 5"
    assert messages[-1]["content"] == "message 24"


async def test_invalid_chat_role_rejected(fresh_db):
    with pytest.raises(ValueError, match="Invalid role"):
        await fresh_db.insert_chat_message("system", "nope")
