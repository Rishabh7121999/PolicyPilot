"""Re-index every uploaded policy.

    uv run python -m backend.rag.ingest --reindex-all            # re-ingest each policy in place
    uv run python -m backend.rag.ingest --reindex-all --only 3,5 # just these policies

Each policy is re-ingested by a separate `backend.rag.ingest_job` subprocess
(one PDF per process, to dodge Docling's multi-conversion crash). Its chunks
are replaced in a single Postgres transaction, so this is safe to run while
the backend is up.
"""

import argparse
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import select

from backend import storage
from backend.config import BASE_DIR
from backend.db import SessionLocal
from backend.models import Policy


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

        return [(p.id, p.file_path) for p in rows if p.file_path and storage.exists(p.file_path)]
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Re-index uploaded policies")
    parser.add_argument("--reindex-all", action="store_true", required=True)
    parser.add_argument("--only", help="Comma-separated policy ids to re-index (default: all)")
    args = parser.parse_args()

    only = {int(i) for i in args.only.split(",")} if args.only else None

    policies = _policies_to_reindex(only)

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
