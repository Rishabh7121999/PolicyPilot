import json
import subprocess
import sys
import tempfile
from pathlib import Path

from langchain_core.documents import Document

from backend.config import BASE_DIR
from backend.db import SessionLocal
from backend.models import Policy
from backend.rag.retriever import invalidate_bm25_cache
from backend.rag.vectorstore import get_vectordb


def run_ingestion_job(policy_id: int) -> None:
    """Background job: convert the uploaded PDF, embed its chunks, and
    extract a structured summary. Runs on a Starlette threadpool thread, so
    it opens its own DB session rather than reusing the request's.

    The Docling conversion + Gemini extraction happen in an isolated
    subprocess (see rag/ingest_worker.py) to avoid a flaky native crash that
    would otherwise eventually take down the whole backend process.
    """
    db = SessionLocal()

    try:
        policy = db.get(Policy, policy_id)

        if policy is None:
            return

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            out_path = tmp.name

        try:
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "backend.rag.ingest_worker",
                    "--pdf-path", policy.file_path,
                    "--policy-id", str(policy.id),
                    "--out", out_path,
                ],
                check=True,
                cwd=BASE_DIR,
            )

            result = json.loads(Path(out_path).read_text())
        finally:
            Path(out_path).unlink(missing_ok=True)

        if not result["ok"]:
            raise RuntimeError(result["error"])

        chunks = [
            Document(page_content=c["page_content"], metadata=c["metadata"])
            for c in result["chunks"]
        ]

        get_vectordb().add_documents(chunks)
        invalidate_bm25_cache()

        summary = result["summary"]

        policy.summary_json = summary
        policy.chunk_count = len(chunks)
        policy.policy_type = summary.get("policy_type", "unknown")
        policy.insurer = summary.get("insurer")
        policy.product_name = summary.get("product_name")
        policy.policy_number = summary.get("policy_number")
        policy.sum_insured = summary.get("sum_insured")
        policy.sum_insured_numeric = summary.get("sum_insured_numeric")
        policy.policy_end_date = summary.get("policy_end_date")
        policy.policy_end_date_iso = summary.get("policy_end_date_iso")
        policy.status = "ready"
        policy.error_message = None

        db.commit()

    except Exception as e:
        db.rollback()
        policy = db.get(Policy, policy_id)

        if policy is not None:
            policy.status = "failed"
            policy.error_message = str(e)
            db.commit()

    finally:
        db.close()
