import json
import subprocess
import sys
import tempfile
from pathlib import Path

from backend.config import BASE_DIR, INGESTION_MODE
from backend.rag.ingest_job import persist
from backend.rag.retriever import invalidate_bm25_cache


def run_ingestion_job(policy_id: int) -> None:
    """Background job for an uploaded policy. Runs on a Starlette threadpool
    thread.

    The Docling conversion + Gemini extraction happen in an isolated
    subprocess (`backend.rag.ingest_job --out`) to avoid a flaky native crash
    that would otherwise eventually take down the whole backend process; the
    vector-store and DB writes then happen here (see `ingest_job.persist`).
    """
    if INGESTION_MODE != "local":
        raise NotImplementedError(f"INGESTION_MODE={INGESTION_MODE!r} is not supported yet")

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        out_path = tmp.name

    try:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "backend.rag.ingest_job",
                "--policy-id", str(policy_id),
                "--out", out_path,
            ],
            cwd=BASE_DIR,
        )

        try:
            result = json.loads(Path(out_path).read_text())
        except (OSError, ValueError):
            # The worker died before writing its result (e.g. a native crash).
            result = {"ok": False, "error": "Ingestion worker crashed"}
    finally:
        Path(out_path).unlink(missing_ok=True)

    persist(policy_id, result)
    invalidate_bm25_cache()
