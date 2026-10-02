from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import JINA_API_KEY, VITE_DEV_ORIGIN
from backend.db import Base, engine, sync_columns
from backend.routers import auth, chat, chat_sessions, policies, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not JINA_API_KEY:
        raise RuntimeError("JINA_API_KEY is not set (needed for reranking); add it to .env")

    Base.metadata.create_all(bind=engine)
    sync_columns()
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
