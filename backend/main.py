from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import JINA_API_KEY, VITE_DEV_ORIGIN
from backend.routers import auth, chat, chat_sessions, policies, voice
from backend.voice.tts import load_voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not JINA_API_KEY:
        raise RuntimeError("JINA_API_KEY is not set (needed for reranking); add it to .env")

    # Schema is managed by Alembic (`uv run alembic upgrade head`), not at boot.
    # Load (and on first run, download) the TTS voice now rather than on the
    # first voice answer.
    load_voice()
    yield


app = FastAPI(title="Insurance Voicebot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[VITE_DEV_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(policies.router)
app.include_router(chat.router)
app.include_router(chat_sessions.router)
app.include_router(voice.router)
