"""Subprocess entry point for converting a single uploaded PDF.

Docling's model stack has a flaky native crash (loky/joblib resource-tracker
teardown race on macOS) when more than one PDF is converted in the same
process. `backend/rag/ingest.py`'s CLI batch works around this by shelling out to a
fresh subprocess per file; the FastAPI upload flow (backend/services/ingestion.py)
needs the same isolation since it runs in-process across the server's whole
lifetime, so a couple of uploads could otherwise eventually crash the backend.

This script does the crash-prone work (Docling conversion + chunking + the
Gemini structured-extraction call) in isolation and writes the result to a
JSON file. It deliberately does NOT touch the vector store or the SQLite DB
-- those writes happen back in the parent process, so nothing here needs a
Chroma/SQLite connection shared across processes.
"""

import argparse
import json
import sys

from dotenv import load_dotenv

load_dotenv()

from backend.rag.loader import parse_and_chunk
from backend.chains.policy_summary_chain import extract_policy_summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy-type", required=True)
    parser.add_argument("--pdf-path", required=True)
    parser.add_argument("--policy-id", required=True)
    parser.add_argument("--out", required=True, help="Path to write the result JSON to")
    args = parser.parse_args()

    try:
        chunks, full_text = parse_and_chunk(
            args.pdf_path,
            policy_type=args.policy_type,
            policy_id=args.policy_id,
        )
        summary = extract_policy_summary(full_text)

        result = {
            "ok": True,
            "chunks": [
                {"page_content": doc.page_content, "metadata": doc.metadata}
                for doc in chunks
            ],
            "summary": summary.model_dump(),
        }
    except Exception as e:
        result = {"ok": False, "error": f"{type(e).__name__}: {e}"}

    with open(args.out, "w") as f:
        json.dump(result, f)

    if not result["ok"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
