import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import ChatMessage, ChatSession, Policy, User
from backend.schemas import (
    ChatSessionCreate,
    ChatSessionDetail,
    ChatSessionListItem,
    ChatSessionMessageCreate,
    ChatSessionPolicyUpdate,
)
from backend.services.chat_service import answer_question_stream

router = APIRouter(prefix="/chat/sessions", tags=["chat-sessions"])


@router.post("", response_model=ChatSessionListItem)
def create_session(
    body: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.policy_id is not None:
        policy = db.get(Policy, body.policy_id)
        if policy is None or policy.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Policy not found")

    session = ChatSession(user_id=current_user.id, policy_id=body.policy_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("", response_model=list[ChatSessionListItem])
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    ).scalars().all()


@router.get("/{session_id}", response_model=ChatSessionDetail)
def get_session(
    session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    session = db.get(ChatSession, session_id)

    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    messages = db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    ).scalars().all()

    return ChatSessionDetail(
        id=session.id,
        title=session.title,
        policy_id=session.policy_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=messages,
    )


@router.patch("/{session_id}", response_model=ChatSessionListItem)
def update_session_policy(
    session_id: int,
    body: ChatSessionPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change (or clear) a session's policy scope mid-conversation -- via the
    Chat page's scope picker, or after the user answers a clarification
    question by picking one of the offered policies."""
    session = db.get(ChatSession, session_id)

    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    if body.policy_id is not None:
        policy = db.get(Policy, body.policy_id)
        if policy is None or policy.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Policy not found")

    session.policy_id = body.policy_id
    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)

    return session


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    session = db.get(ChatSession, session_id)

    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()


def _serialize_message(m: ChatMessage) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "text": m.text,
        "sources": m.sources,
        "meta": m.meta,
        "created_at": m.created_at.isoformat(),
    }


@router.post("/{session_id}/messages")
def post_session_message(
    session_id: int,
    body: ChatSessionMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Streams newline-delimited JSON events: `meta`, `token` (one per
    generated chunk), then `done` -- once the answer is fully generated, the
    assistant message is persisted and `done` carries both saved messages
    (with real ids/timestamps) plus the session title, matching what the
    non-streaming endpoint used to return in one shot."""

    session = db.get(ChatSession, session_id)

    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    prior = db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    ).scalars().all()

    history = [f"{'User' if m.role == 'user' else 'Assistant'}: {m.text}" for m in prior]

    user_message = ChatMessage(session_id=session_id, role="user", text=body.message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    def event_stream():
        for event in answer_question_stream(
            body.message,
            history,
            session.policy_id,
            db=db,
            voice=body.voice,
            user_id=current_user.id,
        ):
            if event["type"] != "done":
                yield json.dumps(event) + "\n"
                continue

            meta: dict = {}
            if event["clarification_options"]:
                meta["clarification_options"] = event["clarification_options"]
            if event["resolved_policy"]:
                meta["resolved_policy"] = event["resolved_policy"]

            assistant_message = ChatMessage(
                session_id=session_id,
                role="assistant",
                text=event["answer"],
                sources=event["sources"],
                meta=meta or None,
            )
            db.add(assistant_message)

            if session.title is None:
                session.title = body.message.strip()[:60]
            session.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(assistant_message)

            yield json.dumps({
                "type": "done",
                "user_message": _serialize_message(user_message),
                "assistant_message": _serialize_message(assistant_message),
                "session_title": session.title,
                "needs_clarification": event["needs_clarification"],
            }) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
