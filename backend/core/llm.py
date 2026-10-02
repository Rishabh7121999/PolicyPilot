"""The one place Gemini chat models are created. Every chain gets its model
from `get_chat_model()`, which:

- rate-limits each call against that model's quotas (backend/core/rate_limiter.py)
  before it's sent, and records the actual token usage afterwards;
- rotates across MODEL_ROTATION: if a model is out of quota (ours or the
  API's) or overloaded, the call falls through to the next model, which has
  its own separate quota;
- turns API 429/402/503 errors into `QuotaExceeded`/`ModelOverloaded`, so
  callers can tell "try later" apart from a real bug.
"""

import queue
import threading
from collections.abc import Iterator
from typing import Any

import httpx
from langchain_core.messages import AIMessage
from langchain_core.runnables import Runnable, RunnableConfig
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from backend.core.rate_limiter import (
    LLMUnavailable,
    ModelOverloaded,
    QuotaExceeded,
    acquire,
    record_usage,
)

# Tried in order; each has its own quota.
MODEL_ROTATION = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]

# Rough chars-per-token for estimating a call's size before sending it.
CHARS_PER_TOKEN = 4


def translate_api_error(error: Exception, resource: str) -> Exception:
    """Map a Gemini API error onto our quota/overload exceptions, or return it unchanged."""
    if isinstance(error, LLMUnavailable):
        return error

    # Dropped/reset connections, connect failures, read timeouts.
    if isinstance(error, httpx.TransportError):
        return ModelOverloaded(f"{resource}: {type(error).__name__}: {error}")

    message = str(error)

    if "RESOURCE_EXHAUSTED" in message or "429" in message or "402" in message:
        return QuotaExceeded(resource, "server", 60)

    lowered = message.lower()
    if (
        "UNAVAILABLE" in message
        or "503" in message
        or "504" in message
        or "DEADLINE_EXCEEDED" in message
        or "overloaded" in lowered
        or "timed out" in lowered
        or "timeout" in lowered
    ):
        return ModelOverloaded(f"{resource}: {message[:200]}")

    return error


def _input_chars(value: Any) -> int:
    if hasattr(value, "to_string"):
        return len(value.to_string())
    return len(str(value))


def _iterate_with_stall_timeout(chunks: Iterator[Any], stall_timeout_s: float, resource: str) -> Iterator[Any]:
    """Yield from `chunks`, raising ModelOverloaded if no chunk arrives for
    `stall_timeout_s`.

    The HTTP client's read timeout doesn't reliably cover a stream the server
    keeps open without sending anything (seen in practice: a generation stream
    hung ~10 minutes until the server reset it). So the stream is pumped from
    a daemon thread and the wait happens here, where it can be bounded. On a
    stall the thread is abandoned; it ends when its connection does.
    """
    handoff: queue.Queue = queue.Queue()

    def pump() -> None:
        try:
            for chunk in chunks:
                handoff.put(("chunk", chunk))
            handoff.put(("done", None))
        except BaseException as e:  # noqa: BLE001 -- re-raised on the caller's thread
            handoff.put(("error", e))

    threading.Thread(target=pump, daemon=True).start()

    while True:
        try:
            kind, value = handoff.get(timeout=stall_timeout_s)
        except queue.Empty:
            raise ModelOverloaded(f"{resource}: no response for {stall_timeout_s:.0f}s") from None

        if kind == "chunk":
            yield value
        elif kind == "error":
            raise value
        else:
            return


class RateLimitedModel(Runnable):
    """Wraps a model runnable: `acquire()` before each call, `record_usage()` after."""

    def __init__(
        self,
        runnable: Runnable,
        model: str,
        max_output_tokens: int,
        max_wait_s: float,
        stall_timeout_s: float,
    ):
        self.runnable = runnable
        self.model = model
        self.max_output_tokens = max_output_tokens
        self.max_wait_s = max_wait_s
        self.stall_timeout_s = stall_timeout_s

    @property
    def InputType(self) -> Any:  # noqa: N802 -- Runnable API
        return Any

    @property
    def OutputType(self) -> Any:  # noqa: N802 -- Runnable API
        return Any

    def _reserve(self, input: Any) -> int:
        estimate = _input_chars(input) // CHARS_PER_TOKEN + self.max_output_tokens
        return acquire(self.model, estimate, self.max_wait_s)

    def invoke(self, input: Any, config: RunnableConfig | None = None, **kwargs: Any) -> Any:
        reservation = self._reserve(input)

        try:
            result = self.runnable.invoke(input, config, **kwargs)
        except Exception as e:
            raise translate_api_error(e, self.model) from e

        if isinstance(result, AIMessage) and result.usage_metadata:
            record_usage(reservation, result.usage_metadata["total_tokens"])

        return result

    def stream(self, input: Any, config: RunnableConfig | None = None, **kwargs: Any) -> Iterator[Any]:
        reservation = self._reserve(input)
        total_tokens = None

        chunks = _iterate_with_stall_timeout(
            self.runnable.stream(input, config, **kwargs), self.stall_timeout_s, self.model
        )

        try:
            for chunk in chunks:
                usage = getattr(chunk, "usage_metadata", None)
                if usage:
                    total_tokens = max(total_tokens or 0, usage["total_tokens"])
                yield chunk
        except Exception as e:
            raise translate_api_error(e, self.model) from e

        record_usage(reservation, total_tokens)


def get_chat_model(
    *,
    max_output_tokens: int,
    timeout: float,
    max_wait_s: float,
    schema: type[BaseModel] | None = None,
) -> Runnable:
    """A rate-limited, model-rotating Gemini chat model.

    max_output_tokens: also used to size the token reservation.
    max_wait_s: how long to wait for a model's per-minute window before
        trying the next model. Keep it short on the chat path; background
        jobs can afford to wait.
    schema: if given, returns structured output parsed into that model.
    """
    candidates = []

    for model in MODEL_ROTATION:
        llm = ChatGoogleGenerativeAI(
            model=model,
            temperature=0,
            timeout=timeout,
            max_output_tokens=max_output_tokens,
            # No client-side retries: each retry is another request against
            # the quota that the limiter wouldn't see. Rotation and the
            # callers' own retry policy handle failures instead.
            max_retries=0,
        )
        runnable = llm.with_structured_output(schema) if schema is not None else llm
        candidates.append(
            RateLimitedModel(runnable, model, max_output_tokens, max_wait_s, stall_timeout_s=timeout)
        )

    primary, *fallbacks = candidates

    return primary.with_fallbacks(fallbacks, exceptions_to_handle=(LLMUnavailable,))
