"""§13.9: transport and parse failures both get one retry, then a safe fallback."""

import types

import pytest

from app.llm import client
from app.llm.client import FALLBACK_MESSAGE, complete

VALID = '{"message": "Hi", "trades": [], "watchlist_changes": []}'
WITH_TRADE = (
    '{"message": "Buying", '
    '"trades": [{"ticker": "AAPL", "side": "buy", "quantity": 3}], '
    '"watchlist_changes": []}'
)


def _response(content):
    message = types.SimpleNamespace(content=content)
    return types.SimpleNamespace(choices=[types.SimpleNamespace(message=message)])


@pytest.fixture
def fake_llm(monkeypatch):
    """Queue up per-attempt outcomes; exceptions are raised, strings returned."""

    def _install(*outcomes):
        calls = []

        async def fake_acompletion(**kwargs):
            calls.append(kwargs)
            outcome = outcomes[len(calls) - 1]
            if isinstance(outcome, Exception):
                raise outcome
            return _response(outcome)

        monkeypatch.setattr(client, "acompletion", fake_acompletion)
        return calls

    return _install


async def test_parses_structured_output(fake_llm):
    fake_llm(WITH_TRADE)

    response = await complete([{"role": "user", "content": "buy 3 AAPL"}])

    assert response.message == "Buying"
    assert response.trades[0].ticker == "AAPL"


async def test_uses_cerebras_via_openrouter(fake_llm):
    calls = fake_llm(VALID)

    await complete([{"role": "user", "content": "hi"}])

    assert calls[0]["model"] == "openrouter/openai/gpt-oss-120b"
    assert calls[0]["extra_body"] == {"provider": {"order": ["cerebras"]}}
    assert calls[0]["response_format"] is not None


async def test_retries_once_after_transport_failure(fake_llm):
    calls = fake_llm(TimeoutError("upstream timeout"), VALID)

    response = await complete([{"role": "user", "content": "hi"}])

    assert len(calls) == 2
    assert response.message == "Hi"


async def test_retries_once_after_unparseable_output(fake_llm):
    calls = fake_llm("not json at all", VALID)

    response = await complete([{"role": "user", "content": "hi"}])

    assert len(calls) == 2
    assert response.message == "Hi"


@pytest.mark.parametrize(
    "outcomes",
    [
        (TimeoutError("timeout"), RuntimeError("rate limited")),
        ("garbage", "still garbage"),
        (None, None),
    ],
)
async def test_falls_back_after_two_failures(fake_llm, outcomes):
    calls = fake_llm(*outcomes)

    response = await complete([{"role": "user", "content": "hi"}])

    assert len(calls) == 2
    assert response.message == FALLBACK_MESSAGE
    assert response.trades == []
    assert response.watchlist_changes == []
