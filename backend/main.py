from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import update

from backend.config import CORS_ORIGINS, JINA_API_KEY, STUCK_PROCESSING_MINUTES
from backend.db import SessionLocal
from backend.models import Policy
from backend.routers import auth, chat, chat_sessions, policies, voice
from backend.voice.tts import load_voice


def fail_stuck_policies() -> None:
    """Mark policies whose ingestion job was lost (restart, crash, killed job)
    as failed, so the user can delete and re-upload instead of waiting forever."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STUCK_PROCESSING_MINUTES)
    with SessionLocal() as db:
        db.execute(
            update(Policy)
            .where(Policy.status == "processing", Policy.created_at < cutoff)
            .values(
                status="failed",
                error_message="Processing did not finish (the job was interrupted). Please re-upload.",
            )
        )
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not JINA_API_KEY:
        raise RuntimeError("JINA_API_KEY is not set (needed for reranking); add it to .env")

    # Schema is managed by Alembic (`uv run alembic upgrade head`), not at boot.
    # Load (and on first run, download) the TTS voice now rather than on the
    # first voice answer.
    load_voice()
    fail_stuck_policies()
    yield


app = FastAPI(title="Insurance Voicebot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(policies.router)
app.include_router(chat.router)
app.include_router(chat_sessions.router)
app.include_router(voice.router)
