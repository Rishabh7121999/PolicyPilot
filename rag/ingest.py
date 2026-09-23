import argparse
import os
import shutil
import subprocess
import sys

from dotenv import load_dotenv

load_dotenv()

if not os.getenv("GOOGLE_API_KEY"):
    raise ValueError("GOOGLE_API_KEY not found in .env")

PDF_FILES = {
    "health": [
        "data/Health_Insurance.pdf",
        "data/Health_Insurance_2026.pdf",
        "data/Health_TopUp_2026.pdf",
    ],
    "life": [
        "data/Life_Insurance_2026.pdf",
    ],
}


def _ingest_single(policy_type: str, pdf_path: str) -> int:
    from rag.loader import parse_and_chunk
    from rag.vectorstore import get_vectordb

    chunks, _full_text = parse_and_chunk(pdf_path, policy_type=policy_type)
    get_vectordb().add_documents(chunks)
    return len(chunks)


def main():
    parser = argparse.ArgumentParser(
        description="Ingest insurance PDFs into the vector store"
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Wipe and recreate the vector store instead of adding to it",
    )
    parser.add_argument(
        "--single",
        nargs=2,
        metavar=("POLICY_TYPE", "PDF_PATH"),
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args()

    if args.single:
        policy_type, pdf_path = args.single
        n = _ingest_single(policy_type, pdf_path)
        print(f"  {n} chunks")
        return

    from rag.vectorstore import PERSIST_DIRECTORY

    if args.rebuild and os.path.exists(PERSIST_DIRECTORY):
        print("Deleting existing vector database...")
        shutil.rmtree(PERSIST_DIRECTORY)

    total_files = sum(len(files) for files in PDF_FILES.values())
    processed = 0

    for policy_type, files in PDF_FILES.items():
        for pdf_path in files:
            print(f"Processing: {pdf_path}")

            # Docling's model stack has a flaky native crash when more than
            # one PDF is converted in the same process on macOS (loky/joblib
            # resource-tracker teardown race) -- isolate each file in its own
            # subprocess so one crash can't take down the whole batch.
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "rag.ingest",
                    "--single",
                    policy_type,
                    pdf_path,
                ],
                check=True,
            )
            processed += 1

    print(f"\nIngestion complete. {processed}/{total_files} files processed.")
    print(f"Location: {PERSIST_DIRECTORY}")


if __name__ == "__main__":
    main()
