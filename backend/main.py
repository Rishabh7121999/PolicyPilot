from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import VITE_DEV_ORIGIN
from backend.db import Base, engine
from backend.routers import chat, policies, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Insurance Voicebot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[VITE_DEV_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(policies.router)
app.include_router(chat.router)
app.include_router(voice.router)
