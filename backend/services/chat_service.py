import logging
from typing import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.chains.policy_resolver import resolve_policy
from backend.chains.query_rewriter import rewrite_query
from backend.core.insurance_bot import ask_insurance_bot_stream
from backend.core.rate_limiter import LLMUnavailable, QuotaExceeded
from backend.models import Policy

logger = logging.getLogger(__name__)


def _list_ready_policies(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(
        select(Policy).where(Policy.status == "ready", Policy.user_id == user_id)
    ).scalars().all()

    return [
        {
            "id": p.id,
            "policy_type": p.policy_type,
            "insurer": p.insurer,
            "product_name": p.product_name,
        }
        for p in rows
    ]


_TYPE_LABEL = {"health": "Health Insurance", "life": "Life Insurance", "motor": "Motor Insurance"}


def _policy_label(p: dict) -> str:
    type_label = _TYPE_LABEL.get(p["policy_type"], "Policy")
    detail = p.get("product_name") or p.get("insurer")
    return f"{type_label} · {detail}" if detail else type_label


def _candidates_for(policy_type: str, policies: list[dict]) -> list[dict]:
    if policy_type in ("health", "life", "motor"):
        matches = [p for p in policies if p["policy_type"] == policy_type]
    else:
        matches = policies

    return [{"id": p["id"], "label": _policy_label(p)} for p in matches]


def _stream_answer(stream: dict, resolved_policy: dict | None) -> Iterator[dict]:
    """Drains a `ask_insurance_bot_stream(...)` result, yielding a `token`
    event per chunk and a final `done` event once generation completes."""
    answer_parts = []

    for token in stream["token_stream"]:
        answer_parts.append(token)
        yield {"type": "token", "text": token}

    yield {
        "type": "done",
        "answer": "".join(answer_parts),
        "sources": stream["sources"],
        "timings": stream["timings"],
        "resolved_policy": resolved_policy,
        "clarification_options": None,
        "needs_clarification": False,
    }


def _unavailable_message(error: LLMUnavailable) -> str:
    if isinstance(error, QuotaExceeded) and error.scope == "day":
        hours = max(1, round(error.retry_after / 3600))
        return (
            "I've reached my daily usage limit, so I can't answer right now. "
            f"Please try again in about {hours} hour{'s' if hours != 1 else ''}."
        )

    if isinstance(error, QuotaExceeded):
        return "I'm getting a lot of questions right now. Please try again in about a minute."

    return "The AI model is busy right now. Please try again in a moment."


def answer_question_stream(
    message: str,
    history: list[str],
    policy_id: int | None = None,
    db: Session | None = None,
    voice: bool = False,
    user_id: int | None = None,
) -> Iterator[dict]:
    """Yields `{"type": "meta", ...}` once resolution/scoping is known, then a
    `{"type": "token", "text": ...}` per chunk of the generated answer, then a
    final `{"type": "done", ...}` carrying the assembled answer + sources.

    If every model is out of quota or overloaded, the "answer" is a short
    message saying so (with the same event shapes), rather than an error
    that would break the stream mid-way."""
    meta_sent = False

    try:
        for event in _answer_question_stream(message, history, policy_id, db, voice, user_id):
            meta_sent = meta_sent or event["type"] == "meta"
            yield event
    except LLMUnavailable as e:
        logger.warning("Chat turn failed, no model available: %s", e)
        text = _unavailable_message(e)

        if not meta_sent:
            yield {
                "type": "meta",
                "resolved_policy": None,
                "clarification_options": None,
                "needs_clarification": False,
                "policy_type": None,
            }
        yield {"type": "token", "text": text}
        yield {
            "type": "done",
            "answer": text,
            "sources": [],
            "timings": None,
            "resolved_policy": None,
            "clarification_options": None,
            "needs_clarification": False,
        }


def _answer_question_stream(
    message: str,
    history: list[str],
    policy_id: int | None,
    db: Session | None,
    voice: bool,
    user_id: int | None,
) -> Iterator[dict]:

    if policy_id is not None:
        # Already scoped (a Chat page session pinned to a policy, or the
        # floating assistant on a policy's detail page) -- no need to resolve
        # which policy, but still rewrite the query using history on every
        # turn so follow-ups ("and the waiting period for that?") retrieve
        # correctly.
        standalone_query = rewrite_query(message, history)

        policy = db.get(Policy, policy_id) if db is not None else None
        policy_type = policy.policy_type if policy else None

        resolved_policy = (
            {
                "id": policy_id,
                "label": _policy_label(
                    {
                        "policy_type": policy.policy_type,
                        "insurer": policy.insurer,
                        "product_name": policy.product_name,
                    }
                ),
            }
            if policy is not None
            else None
        )

        yield {
            "type": "meta",
            "resolved_policy": resolved_policy,
            "clarification_options": None,
            "needs_clarification": False,
            "policy_type": policy_type,
        }

        stream = ask_insurance_bot_stream(
            message,
            history,
            policy_id=policy_id,
            policy_type=policy_type,
            standalone_query=standalone_query,
            voice=voice,
        )

        yield from _stream_answer(stream, resolved_policy)
        return

    policies = _list_ready_policies(db, user_id) if db is not None and user_id is not None else []
    resolution = resolve_policy(message, history, policies)

    if resolution.needs_clarification:
        clarification_options = _candidates_for(resolution.policy_type, policies)

        yield {
            "type": "meta",
            "resolved_policy": None,
            "clarification_options": clarification_options,
            "needs_clarification": True,
            "policy_type": None,
        }
        yield {"type": "token", "text": resolution.clarification_question}
        yield {
            "type": "done",
            "answer": resolution.clarification_question,
            "sources": [],
            "timings": None,
            "resolved_policy": None,
            "clarification_options": clarification_options,
            "needs_clarification": True,
        }
        return

    resolved_policy_type = (
        None if resolution.policy_type in ("both", "unknown") else resolution.policy_type
    )

    resolved_policy = None
    if resolution.resolved_policy_id is not None:
        matched = next(
            (p for p in policies if p["id"] == resolution.resolved_policy_id), None
        )
        if matched is not None:
            resolved_policy = {"id": matched["id"], "label": _policy_label(matched)}

    yield {
        "type": "meta",
        "resolved_policy": resolved_policy,
        "clarification_options": None,
        "needs_clarification": False,
        "policy_type": resolved_policy_type,
    }

    stream = ask_insurance_bot_stream(
        message,
        history,
        policy_id=resolution.resolved_policy_id,
        policy_type=resolved_policy_type,
        standalone_query=resolution.standalone_question,
        voice=voice,
    )

    yield from _stream_answer(stream, resolved_policy)
