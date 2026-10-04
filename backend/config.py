import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# "dev" (laptop) or "prod" (Cloud Run). prod refuses to boot with dev defaults.
ENV = os.getenv("ENV", "dev")

# Postgres (Neon) when DATABASE_URL is set, e.g.
# postgresql+psycopg://user:pass@host/db?sslmode=require
# Otherwise the local SQLite file, so a laptop still works offline.
DB_PATH = BASE_DIR / "backend" / "policies.db"
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DB_PATH}"

# Where uploaded policy PDFs live: "local" (UPLOADS_DIR on this machine) or
# "gcs" (the GCS_BUCKET bucket; what Cloud Run uses, since its disk is ephemeral).
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
GCS_BUCKET = os.getenv("GCS_BUCKET")
UPLOADS_DIR = BASE_DIR / "backend" / "uploads"

VITE_DEV_ORIGIN = "http://localhost:5173"

JINA_API_KEY = os.getenv("JINA_API_KEY")

# Gemini runs on Vertex AI, authenticated with Application Default Credentials
# (`gcloud auth application-default login` locally; the service account on
# Cloud Run) -- no API key. Gemini 3.x models are served from "global".
GCP_PROJECT = os.getenv("GCP_PROJECT")
GCP_LOCATION = os.getenv("GCP_LOCATION", "global")

# "local": run each ingestion job as a subprocess of the backend.
# "cloudrun": trigger a Cloud Run Job execution instead (Phase 2, not yet implemented).
INGESTION_MODE = os.getenv("INGESTION_MODE", "local")

_DEV_SECRET_KEY = "dev-insecure-secret-change-me"
SECRET_KEY = os.getenv("SECRET_KEY", _DEV_SECRET_KEY)
if ENV == "prod" and SECRET_KEY == _DEV_SECRET_KEY:
    raise RuntimeError("SECRET_KEY must be set when ENV=prod")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
JWT_ALGORITHM = "HS256"
