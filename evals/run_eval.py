"""Retrieval/answer eval over evals/questions.jsonl.

    uv run python -m evals.run_eval              # retrieval only (no LLM calls)
    uv run python -m evals.run_eval --answers    # also generate answers and check them
    uv run python -m evals.run_eval --out evals/results/baseline.json

Retrieval hit = some retrieved chunk from the policy's file starts on one of
`expected_pages` (or within --page-tolerance of one; a chunk's `page`
metadata is only its first page, so a tolerance of 1 is the default).
"""

import argparse
import json
import re
import statistics
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from backend.core.insurance_bot import _retrieve
from backend.db import SessionLocal
from backend.models import Policy
from backend.services.chat_service import answer_question_stream

QUESTIONS_PATH = Path(__file__).parent / "questions.jsonl"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower())


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(pct / 100 * (len(ordered) - 1)))]


def _retrieval_hit(docs, source_file: str, expected_pages: list[int], tolerance: int) -> bool:
    for doc in docs:
        if doc.metadata.get("source_file") != source_file:
            continue
        page = doc.metadata.get("page")
        if page is not None and any(abs(page - p) <= tolerance for p in expected_pages):
            return True
    return False


def _answer(question: str, policy_id: int, user_id: int | None, db) -> str:
    final = None
    for event in answer_question_stream(question, [], policy_id=policy_id, db=db, user_id=user_id):
        if event["type"] == "done":
            final = event
    return final["answer"] if final else ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--answers", action="store_true", help="Also generate and check answers")
    parser.add_argument("--page-tolerance", type=int, default=1)
    parser.add_argument("--only", help="Comma-separated question ids")
    parser.add_argument(
        "--delay",
        type=float,
        default=0,
        help="Seconds to wait between questions (stays under the reranker API's rate limit)",
    )
    parser.add_argument("--out", help="Write per-question results JSON here")
    args = parser.parse_args()

    questions = [json.loads(line) for line in QUESTIONS_PATH.read_text().splitlines() if line.strip()]
    if args.only:
        wanted = set(args.only.split(","))
        questions = [q for q in questions if q["id"] in wanted]

    db = SessionLocal()
    results = []

    try:
        for i, q in enumerate(questions):
            if i and args.delay:
                time.sleep(args.delay)

            policy = db.get(Policy, q["policy_id"])
            if policy is None:
                print(f"{q['id']}: policy {q['policy_id']} not found, skipping")
                continue

            source_file = Path(policy.file_path).name

            start = time.time()
            docs, info = _retrieve(q["question"], q["policy_id"], None)
            retrieval_s = time.time() - start

            hit = _retrieval_hit(docs, source_file, q["expected_pages"], args.page_tolerance)
            row = {
                "id": q["id"],
                "hit": hit,
                "retrieval_s": round(retrieval_s, 3),
                "pages": [d.metadata.get("page") for d in docs],
                **info,
            }

            if args.answers:
                answer = _answer(q["question"], q["policy_id"], policy.user_id, db)
                normalized = _normalize(answer)
                row["answer_ok"] = any(_normalize(s) in normalized for s in q["expected_answer_contains"])
                row["answer"] = answer

            results.append(row)

            status = "HIT " if hit else "MISS"
            answer_status = ""
            if args.answers:
                answer_status = " answer=" + ("ok" if row["answer_ok"] else "WRONG")
            print(f"{q['id']}: {status} {retrieval_s:.2f}s pages={row['pages']}{answer_status}")
    finally:
        db.close()

    if not results:
        return

    latencies = [r["retrieval_s"] for r in results]
    hits = sum(r["hit"] for r in results)
    print(f"\nretrieval hit@k: {hits}/{len(results)} ({hits / len(results):.0%})")
    if args.answers:
        ok = sum(r["answer_ok"] for r in results)
        print(f"answer accuracy: {ok}/{len(results)} ({ok / len(results):.0%})")
    print(
        f"retrieval latency: p50={statistics.median(latencies):.2f}s "
        f"p95={_percentile(latencies, 95):.2f}s"
    )
    rerank_latencies = [r["rerank"] for r in results if "rerank" in r]
    if rerank_latencies:
        fallbacks = sum(r.get("rerank_fallback", False) for r in results)
        print(
            f"rerank latency: p50={statistics.median(rerank_latencies):.2f}s "
            f"p95={_percentile(rerank_latencies, 95):.2f}s, fallbacks={fallbacks}"
        )

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
