"""Client-side rate limiting for every external API call (Gemini chat models
and the Jina reranker; speech is local), so the app stays inside each model's per-minute and
per-day quotas instead of finding out from a 429.

Usage is recorded in the `api_calls` table in Postgres rather than in memory,
because calls come from many processes -- every web instance and each
ingestion job -- and because daily counts have to survive restarts. Each
`acquire()` takes a per-resource advisory lock inside its transaction, which
serializes the check-and-record across all of them.

Daily windows reset at midnight Pacific time, matching Gemini's RPD reset.

    uv run python -m backend.core.rate_limiter   # print current usage vs. limits
"""

import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text

from backend.db import SessionLocal


@dataclass(frozen=True)
class Limits:
    rpm: int
    tpm: int
    rpd: int | None = None


# Gemini on Vertex AI: pay-as-you-go with dynamic shared quota, so these are
# conservative guard rails against runaway loops, not the real ceiling (no
# daily cap). Raise them if you hit them. Jina: inferred from observed 429s on the free
# key (~100K tokens/min); check the Jina dashboard and adjust.
LIMITS: dict[str, Limits] = {
    "gemini-3.1-flash-lite": Limits(rpm=300, tpm=1_000_000),
    "gemini-3.5-flash-lite": Limits(rpm=300, tpm=1_000_000),
    "jina-reranker": Limits(rpm=100, tpm=100_000),
}

# Stay below each limit: our counter can't see usage from outside this app
# (the AI Studio playground, other scripts on the same key).
SAFETY_FACTOR = 0.9

WINDOW_S = 60
# Rows older than this are deleted on the next acquire.
RETENTION_S = 2 * 24 * 3600

_PACIFIC = ZoneInfo("America/Los_Angeles")


class LLMUnavailable(Exception):
    """A model or API can't take this call right now. Base class, so callers
    (fallback chains, the chat service) can catch both subclasses."""


class QuotaExceeded(LLMUnavailable):
    def __init__(self, resource: str, scope: str, retry_after: float):
        self.resource = resource
        self.scope = scope  # "minute", "day", or "server" (the API said 429), or "billing" (the API said 402)
        self.retry_after = max(0.0, retry_after)
        super().__init__(f"{resource}: {scope} quota exhausted, retry in {self.retry_after:.0f}s")


class ModelOverloaded(LLMUnavailable):
    """The API reported a transient overload (503 / UNAVAILABLE)."""


def allowed(limit: int) -> int:
    return max(1, math.floor(limit * SAFETY_FACTOR))


def _day_bounds(now: float) -> tuple[float, float]:
    """(start, end) of the current Pacific-time day, as unix timestamps."""
    local = datetime.fromtimestamp(now, _PACIFIC)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    # Aware-datetime arithmetic is wall-clock, and ZoneInfo recomputes the
    # UTC offset, so this is next midnight even across a DST change.
    end = start + timedelta(days=1)
    return start.timestamp(), end.timestamp()


def _seconds_until_fits(rows: list[tuple[float, int]], tokens: int, limits: Limits, now: float) -> float:
    """How long until enough of the minute window's calls (`rows`, oldest
    first) age out for one more call of `tokens` to fit both RPM and TPM."""
    max_calls, max_tokens = allowed(limits.rpm), allowed(limits.tpm)
    remaining_tokens = sum(t for _, t in rows)

    for dropped, (ts, t) in enumerate(rows, start=1):
        remaining_tokens -= t
        if len(rows) - dropped + 1 <= max_calls and remaining_tokens + tokens <= max_tokens:
            return ts + WINDOW_S - now + 0.05

    return WINDOW_S


def acquire(resource: str, estimated_tokens: int, max_wait_s: float) -> int:
    """Block until a call to `resource` fits within its limits, record it,
    and return a reservation id for `record_usage()`.

    Waits up to `max_wait_s` for the per-minute window to free up, then
    raises QuotaExceeded. A spent daily quota raises immediately.
    """
    limits = LIMITS[resource]
    # A single call larger than the whole TPM budget would never fit; let it
    # through once the window is otherwise empty rather than block forever.
    tokens = min(max(1, estimated_tokens), allowed(limits.tpm))
    deadline = time.monotonic() + max_wait_s

    while True:
        now = time.time()

        with SessionLocal() as db:
            # Held until COMMIT/ROLLBACK, so two instances can't both see room
            # and both insert. Per resource: Gemini and Jina don't block each other.
            db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:r))"), {"r": resource})
            db.execute(text("DELETE FROM api_calls WHERE ts < :cutoff"), {"cutoff": now - RETENTION_S})

            if limits.rpd is not None:
                day_start, day_end = _day_bounds(now)
                calls_today = db.execute(
                    text("SELECT COUNT(*) FROM api_calls WHERE resource = :r AND ts >= :start"),
                    {"r": resource, "start": day_start},
                ).scalar_one()
                if calls_today >= allowed(limits.rpd):
                    db.rollback()
                    raise QuotaExceeded(resource, "day", day_end - now)

            rows = [
                (r.ts, r.tokens)
                for r in db.execute(
                    text("SELECT ts, tokens FROM api_calls WHERE resource = :r AND ts > :since ORDER BY ts"),
                    {"r": resource, "since": now - WINDOW_S},
                )
            ]

            if (
                len(rows) + 1 <= allowed(limits.rpm)
                and sum(t for _, t in rows) + tokens <= allowed(limits.tpm)
            ):
                reservation_id = db.execute(
                    text("INSERT INTO api_calls (resource, ts, tokens) VALUES (:r, :ts, :tokens) RETURNING id"),
                    {"r": resource, "ts": now, "tokens": tokens},
                ).scalar_one()
                db.commit()
                return reservation_id

            wait = _seconds_until_fits(rows, tokens, limits, now)
            db.rollback()  # release the lock before sleeping

        if time.monotonic() + wait > deadline:
            raise QuotaExceeded(resource, "minute", wait)

        time.sleep(wait)


def record_usage(reservation_id: int, actual_tokens: int | None) -> None:
    """Replace a reservation's estimated token count with the API's actual one."""
    if actual_tokens is None:
        return

    with SessionLocal() as db:
        db.execute(
            text("UPDATE api_calls SET tokens = :tokens WHERE id = :id"),
            {"tokens": actual_tokens, "id": reservation_id},
        )
        db.commit()


def usage_snapshot() -> dict[str, dict]:
    now = time.time()
    day_start, _ = _day_bounds(now)
    snapshot = {}

    with SessionLocal() as db:
        for resource, limits in LIMITS.items():
            calls_min, tokens_min = db.execute(
                text("SELECT COUNT(*), COALESCE(SUM(tokens), 0) FROM api_calls WHERE resource = :r AND ts > :since"),
                {"r": resource, "since": now - WINDOW_S},
            ).one()
            calls_day = db.execute(
                text("SELECT COUNT(*) FROM api_calls WHERE resource = :r AND ts >= :start"),
                {"r": resource, "start": day_start},
            ).scalar_one()
            snapshot[resource] = {
                "rpm": f"{calls_min}/{allowed(limits.rpm)}",
                "tpm": f"{tokens_min}/{allowed(limits.tpm)}",
                "rpd": f"{calls_day}/{allowed(limits.rpd)}" if limits.rpd else "-",
            }

    return snapshot


if __name__ == "__main__":
    print(f"{'resource':28} {'RPM':>8} {'TPM':>16} {'RPD':>9}   (limits include {SAFETY_FACTOR:.0%} safety factor)")
    for resource, row in usage_snapshot().items():
        print(f"{resource:28} {row['rpm']:>8} {row['tpm']:>16} {row['rpd']:>9}")
