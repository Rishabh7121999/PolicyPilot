from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

DB_PATH = BASE_DIR / "backend" / "policies.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

VECTORDB_DIR = BASE_DIR / "vectordb"

UPLOADS_DIR = BASE_DIR / "backend" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

VITE_DEV_ORIGIN = "http://localhost:5173"
