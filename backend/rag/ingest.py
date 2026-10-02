"""Re-index every uploaded policy into the vector store.

    uv run python -m backend.rag.ingest --reindex-all            # re-ingest each policy in place
    uv run python -m backend.rag.ingest --reindex-all --rebuild  # drop the collection first
    uv run python -m backend.rag.ingest --reindex-all --reembed-from OLD_COLLECTION
        # embedding model changed only: reuse existing chunks, just re-embed

Run with the backend stopped: each policy is re-ingested by a separate
`backend.rag.ingest_job` subprocess (one PDF per process, to dodge Docling's
multi-conversion crash), and Chroma's local client isn't safe for writes
from several processes at once.
"""

import argparse
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from langchain_core.documents import Document
from sqlalchemy import select

from backend.config import BASE_DIR
from backend.db import SessionLocal
from backend.models import Policy
from backend.rag.vectorstore import COLLECTION_NAME, get_vectordb


def _policies_to_reindex(only: set[int] | None) -> list[tuple[int, str]]:
    db = SessionLocal()

    try:
        query = (
            select(Policy)
            .where(
                Policy.status.in_(["ready", "failed"]),
                # Pre-auth rows with no owner are unreachable through the API
                # (see CLAUDE.md "Known issues") -- don't spend quota on them.
                Policy.user_id.is_not(None),
            )
            .order_by(Policy.id)
        )
        if only:
            query = query.where(Policy.id.in_(only))

        rows = db.execute(query).scalars().all()

        return [(p.id, p.file_path) for p in rows if p.file_path and Path(p.file_path).exists()]
    finally:
        db.close()


def _reembed_from(source_collection: str, policies: list[tuple[int, str]]) -> None:
    """Re-embed each policy's chunks from `source_collection` with the
    current embedding model, writing into COLLECTION_NAME. The chunk text and
    metadata are reused as-is, so this skips Docling and the summary LLM call
    entirely -- the cheap path when only the embedding model changed."""
    vectordb = get_vectordb()
    source = vectordb._client.get_collection(source_collection)
    db = SessionLocal()
    missing = []

    try:
        for policy_id, _file_path in policies:
            raw = source.get(where={"policy_id": str(policy_id)}, include=["documents", "metadatas"])

            if not raw["ids"]:
                missing.append(policy_id)
                print(f"Policy {policy_id}: no chunks in '{source_collection}', skipped")
                continue

            chunks = sorted(
                (
                    Document(page_content=text, metadata=metadata)
                    for text, metadata in zip(raw["documents"], raw["metadatas"])
                ),
                key=lambda doc: doc.metadata.get("chunk_index", 0),
            )

            old_ids = vectordb.get(where={"policy_id": str(policy_id)}, include=[])["ids"]
            vectordb.add_documents(chunks)
            if old_ids:
                vectordb.delete(ids=old_ids)

            policy = db.get(Policy, policy_id)
            policy.chunk_count = len(chunks)
            if policy.summary_json:
                policy.status = "ready"
                policy.error_message = None
            db.commit()

            print(f"Policy {policy_id}: re-embedded {len(chunks)} chunks")
    finally:
        db.close()

    if missing:
        print(f"\nNo source chunks for {missing}; run a full re-index for those.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Re-index uploaded policies into the vector store")
    parser.add_argument("--reindex-all", action="store_true", required=True)
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help=f"Delete the '{COLLECTION_NAME}' collection before re-indexing",
    )
    parser.add_argument("--only", help="Comma-separated policy ids to re-index (default: all)")
    parser.add_argument(
        "--reembed-from",
        metavar="COLLECTION",
        help="Copy each policy's existing chunks from this collection and re-embed them "
        "(no Docling, no LLM calls)",
    )
    args = parser.parse_args()

    only = {int(i) for i in args.only.split(",")} if args.only else None

    if args.rebuild:
        if only:
            parser.error("--rebuild drops every policy's chunks; don't combine it with --only")
        print(f"Deleting collection '{COLLECTION_NAME}'...")
        get_vectordb().delete_collection()

    policies = _policies_to_reindex(only)

    if args.reembed_from:
        _reembed_from(args.reembed_from, policies)
        return

    failed = []

    for policy_id, file_path in policies:
        print(f"Policy {policy_id}: {Path(file_path).name}")

        completed = subprocess.run(
            [sys.executable, "-m", "backend.rag.ingest_job", "--policy-id", str(policy_id)],
            cwd=BASE_DIR,
        )
        if completed.returncode != 0:
            failed.append(policy_id)

    print(f"\nRe-indexed {len(policies) - len(failed)}/{len(policies)} policies.")
    if failed:
        print(f"Failed: {failed} (see each policy's error_message)")
        sys.exit(1)


if __name__ == "__main__":
    main()
