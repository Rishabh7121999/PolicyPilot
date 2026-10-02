import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

DB_PATH = BASE_DIR / "backend" / "policies.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

VECTORDB_DIR = BASE_DIR / "vectordb"

# Shared API usage counters (see backend/core/rate_limiter.py).
RATE_LIMIT_DB_PATH = BASE_DIR / "backend" / "rate_limits.db"

UPLOADS_DIR = BASE_DIR / "backend" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

VITE_DEV_ORIGIN = "http://localhost:5173"

JINA_API_KEY = os.getenv("JINA_API_KEY")

# "local": run each ingestion job as a subprocess of the backend.
# "cloudrun": trigger a Cloud Run Job execution instead (Phase 2, not yet implemented).
INGESTION_MODE = os.getenv("INGESTION_MODE", "local")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-secret-change-me")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
JWT_ALGORITHM = "HS256"
