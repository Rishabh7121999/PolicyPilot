"""Ingestion job for one uploaded policy: Docling parse + chunk, Gemini
structured extraction, then chunk and DB writes (one Postgres transaction).

    python -m backend.rag.ingest_job --policy-id N               # full job, in-process
    python -m backend.rag.ingest_job --policy-id N --out r.json  # parse + extract only

The full form is what `backend.rag.ingest --reindex-all` runs per policy, and
what the Cloud Run Job will run in production. The `--out` form exists for
the local backend (backend/services/ingestion.py): it runs this in a
subprocess -- Docling's model stack has a flaky native crash (loky/joblib
teardown race) when one process converts more than one PDF -- but keeps the
writes in the server process.

Only this module and backend/rag/ingest.py import Docling (via
backend/rag/loader.py), so the web process never needs it installed.
"""

import argparse
import json
import logging
import sys

from dotenv import load_dotenv

load_dotenv()

from langchain_core.documents import Document

from backend import storage
from backend.db import SessionLocal
from backend.models import Policy
from backend.rag import chunk_store


def process(policy_id: int) -> dict:
    """Parse, chunk and extract. Returns a JSON-serializable result:
    {"ok": True, "chunks": [...], "summary": {...}} or {"ok": False, "error": ...}.
    Never raises."""
    # Imported here, not at module level: the parent process imports
    # `persist` from this module and must not pull in Docling.
    from backend.chains.policy_summary_chain import extract_policy_summary
    from backend.rag.loader import parse_and_chunk

    db = SessionLocal()

    try:
        policy = db.get(Policy, policy_id)
        if policy is None:
            return {"ok": False, "error": f"Policy {policy_id} not found"}

        with storage.local_copy(policy.file_path) as pdf_path:
            chunks, full_text = parse_and_chunk(pdf_path, policy_id=policy_id)
        summary = extract_policy_summary(full_text)

        for chunk in chunks:
            chunk.metadata["policy_type"] = summary.policy_type

        return {
            "ok": True,
            "chunks": [
                {"page_content": doc.page_content, "metadata": doc.metadata}
                for doc in chunks
            ],
            "summary": summary.model_dump(),
        }
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    finally:
        db.close()


def persist(policy_id: int, result: dict) -> bool:
    """Write a `process()` result: replace the policy's chunks and mark the
    row ready, or mark it failed. Chunks and the Policy row are written in one
    transaction, so a failure leaves the previous state untouched. Returns
    whether it succeeded; never raises."""
    db = SessionLocal()

    try:
        policy = db.get(Policy, policy_id)
        if policy is None:
            return False

        if not result["ok"]:
            raise RuntimeError(result["error"])

        chunks = [
            Document(page_content=c["page_content"], metadata=c["metadata"])
            for c in result["chunks"]
        ]

        # Embedding is slow CPU work; do it before any writes.
        embeddings = chunk_store.embed_documents(chunks)

        chunk_store.replace_policy_chunks(db, policy_id, policy.user_id, chunks, embeddings)

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
        return True

    except Exception as e:
        db.rollback()
        policy = db.get(Policy, policy_id)

        if policy is not None:
            # A failed *re-index* of an already-ready policy keeps it ready:
            # the rollback above left its previous chunks in place.
            if policy.status != "ready":
                policy.status = "failed"
            policy.error_message = str(e)
            db.commit()

        return False

    finally:
        db.close()


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    # Keep our own INFO lines (e.g. loader's ocr=...) without Docling's chatter.
    logging.getLogger("docling").setLevel(logging.WARNING)

    parser = argparse.ArgumentParser()
    parser.add_argument("--policy-id", type=int, required=True)
    parser.add_argument(
        "--out",
        help="Only parse + extract, writing the result JSON here (writes are left to the caller)",
    )
    args = parser.parse_args()

    result = process(args.policy_id)

    if args.out:
        with open(args.out, "w") as f:
            json.dump(result, f)
        ok = result["ok"]
    else:
        ok = persist(args.policy_id, result)

    if not result["ok"]:
        print(result["error"], file=sys.stderr)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
