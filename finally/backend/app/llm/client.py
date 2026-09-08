"""LiteLLM -> OpenRouter -> Cerebras structured-output client (PLAN §9, §13.9)."""

import logging

from litellm import acompletion

from app.llm.schemas import LLMResponse

logger = logging.getLogger("finally.llm")

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}
REQUEST_TIMEOUT_SECONDS = 60

FALLBACK_MESSAGE = "I had trouble processing that, please try again."


async def complete(messages: list[dict[str, str]]) -> LLMResponse:
    """One structured-output call, retried once, then a safe fallback.

    §13.9: transport failures (timeout, HTTP error, rate limit) and unparseable
    structured output are handled identically — one retry, then a generic
    message with no actions, so a bad turn never breaks the chat.
    """
    for attempt in (1, 2):
        try:
            # acompletion, not completion: a blocking call here would stall the
            # event loop that also drives the ~500ms SSE price push (§13.3).
            response = await acompletion(
                model=MODEL,
                messages=messages,
                response_format=LLMResponse,
                reasoning_effort="low",
                extra_body=EXTRA_BODY,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            return LLMResponse.model_validate_json(
                response.choices[0].message.content
            )
        except Exception as exc:
            logger.warning("LLM call attempt %d failed: %s", attempt, exc)

    logger.error("LLM call failed twice; returning fallback response")
    return LLMResponse(message=FALLBACK_MESSAGE)
