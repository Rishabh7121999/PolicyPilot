"""Client-side rate limiting for every external API call (Gemini models and
the Jina reranker), so the app stays inside each model's per-minute and
per-day quotas instead of finding out from a 429.

Usage is recorded in a small SQLite file (RATE_LIMIT_DB_PATH) rather than in
memory, because calls come from more than one process -- the web server and
each ingestion-job subprocess -- and because daily counts have to survive a
server restart. Each `acquire()` runs inside `BEGIN IMMEDIATE`, which
serializes the check-and-record across processes.

Daily windows reset at midnight Pacific time, matching Gemini's RPD reset.

    uv run python -m backend.core.rate_limiter   # print current usage vs. limits

In Phase 2 (several Cloud Run instances) this table has to move to the
shared Postgres database; a local SQLite file is per-instance.
"""

import math
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from backend.config import RATE_LIMIT_DB_PATH


@dataclass(frozen=True)
class Limits:
    rpm: int
    tpm: int
    rpd: int | None = None


# Gemini: AI Studio free-tier limits for this project, as shown on its
# rate-limit page (2026-10-02). Jina: inferred from observed 429s on the free
# key (~100K tokens/min); check the Jina dashboard and adjust.
LIMITS: dict[str, Limits] = {
    "gemini-3.1-flash-lite": Limits(rpm=15, tpm=250_000, rpd=500),
    "gemini-3.5-flash-lite": Limits(rpm=15, tpm=250_000, rpd=500),
    "gemini-3.8-flash-lite-tts": Limits(rpm=3, tpm=10_000, rpd=10),
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
        self.scope = scope  # "minute", "day", or "server" (the API itself said 429/402)
        self.retry_after = max(0.0, retry_after)
        super().__init__(f"{resource}: {scope} quota exhausted, retry in {self.retry_after:.0f}s")


class ModelOverloaded(LLMUnavailable):
    """The API reported a transient overload (503 / UNAVAILABLE)."""


def allowed(limit: int) -> int:
    return max(1, math.floor(limit * SAFETY_FACTOR))


_schema_ready_for: str | None = None


def _connect() -> sqlite3.Connection:
    """A connection to the counters DB, in SQLite's default journal mode:
    `BEGIN IMMEDIATE` plus the busy timeout serialize access across
    processes, and these transactions are tiny, so WAL isn't needed."""
    global _schema_ready_for

    # isolation_level=None: transactions are opened explicitly in acquire().
    conn = sqlite3.connect(RATE_LIMIT_DB_PATH, timeout=30, isolation_level=None)

    if _schema_ready_for != str(RATE_LIMIT_DB_PATH):
        conn.execute(
            "CREATE TABLE IF NOT EXISTS api_calls ("
            " id INTEGER PRIMARY KEY,"
            " resource TEXT NOT NULL,"
            " ts REAL NOT NULL,"
            " tokens INTEGER NOT NULL)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS ix_api_calls_resource_ts ON api_calls (resource, ts)")
        _schema_ready_for = str(RATE_LIMIT_DB_PATH)

    return conn


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

        with closing(_connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute("DELETE FROM api_calls WHERE ts < ?", (now - RETENTION_S,))

                if limits.rpd is not None:
                    day_start, day_end = _day_bounds(now)
                    (calls_today,) = conn.execute(
                        "SELECT COUNT(*) FROM api_calls WHERE resource = ? AND ts >= ?",
                        (resource, day_start),
                    ).fetchone()
                    if calls_today >= allowed(limits.rpd):
                        raise QuotaExceeded(resource, "day", day_end - now)

                rows = conn.execute(
                    "SELECT ts, tokens FROM api_calls WHERE resource = ? AND ts > ? ORDER BY ts",
                    (resource, now - WINDOW_S),
                ).fetchall()

                if (
                    len(rows) + 1 <= allowed(limits.rpm)
                    and sum(t for _, t in rows) + tokens <= allowed(limits.tpm)
                ):
                    cursor = conn.execute(
                        "INSERT INTO api_calls (resource, ts, tokens) VALUES (?, ?, ?)",
                        (resource, now, tokens),
                    )
                    conn.execute("COMMIT")
                    return cursor.lastrowid

                wait = _seconds_until_fits(rows, tokens, limits, now)
            finally:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")

        if time.monotonic() + wait > deadline:
            raise QuotaExceeded(resource, "minute", wait)

        time.sleep(wait)


def record_usage(reservation_id: int, actual_tokens: int | None) -> None:
    """Replace a reservation's estimated token count with the API's actual one."""
    if actual_tokens is None:
        return

    with closing(_connect()) as conn:
        conn.execute("UPDATE api_calls SET tokens = ? WHERE id = ?", (actual_tokens, reservation_id))


def usage_snapshot() -> dict[str, dict]:
    now = time.time()
    day_start, _ = _day_bounds(now)
    snapshot = {}

    with closing(_connect()) as conn:
        for resource, limits in LIMITS.items():
            calls_min, tokens_min = conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(tokens), 0) FROM api_calls WHERE resource = ? AND ts > ?",
                (resource, now - WINDOW_S),
            ).fetchone()
            (calls_day,) = conn.execute(
                "SELECT COUNT(*) FROM api_calls WHERE resource = ? AND ts >= ?",
                (resource, day_start),
            ).fetchone()
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
