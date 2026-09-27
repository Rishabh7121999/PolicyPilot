import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import Policy, User
from backend.schemas import ChatRequest
from backend.services.chat_service import answer_question_stream

router = APIRouter(tags=["chat"])


@router.post("/chat")
def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Streams newline-delimited JSON events: `meta` (once, as soon as scoping
    is resolved), `token` (one per generated chunk), then `done` (final
    answer + sources)."""

    if request.policy_id is not None:
        policy = db.get(Policy, request.policy_id)
        if policy is None or policy.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Policy not found")

    def event_stream():
        for event in answer_question_stream(
            request.message,
            request.history,
            request.policy_id,
            db=db,
            voice=request.voice,
            user_id=current_user.id,
        ):
            yield json.dumps(event) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
