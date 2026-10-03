import logging
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from langchain_core.documents import Document

from backend.config import JINA_API_KEY
from backend.core.rate_limiter import QuotaExceeded, acquire, record_usage
from backend.db import SessionLocal
from backend.rag import chunk_store
from backend.rag.vectorstore import get_embeddings

logger = logging.getLogger(__name__)

JINA_RERANK_URL = "https://api.jina.ai/v1/rerank"
RERANKER_MODEL_NAME = "jina-reranker-v2-base-multilingual"
# Key into backend/core/rate_limiter.py's LIMITS.
JINA_RATE_LIMIT_KEY = "jina-reranker"
# Measured on these policies: ~3.8 chars per Jina token.
JINA_CHARS_PER_TOKEN = 3
# Past this, fall back to the un-reranked fused order rather than stall the chat.
RERANK_TIMEOUT_S = 3.0

# How many candidates each leg of the hybrid search pulls before fusion/reranking.
DENSE_FETCH_K = 12
SPARSE_FETCH_K = 12
# Final number of chunks handed to the LLM, after reranking.
FINAL_K = 8

# Reciprocal rank fusion: a chunk's score is sum(weight / (RRF_K + rank)) over
# the legs that returned it. 60 and equal weights match what the previous
# langchain EnsembleRetriever did.
RRF_K = 60
DENSE_WEIGHT = 0.5
SPARSE_WEIGHT = 0.5

_rerank_session = requests.Session()


def _fuse(dense: list[Document], sparse: list[Document]) -> list[Document]:
    """Merge the two ranked lists with weighted reciprocal rank fusion."""
    scores: dict[int, float] = {}
    by_id: dict[int, Document] = {}

    for weight, ranked in ((DENSE_WEIGHT, dense), (SPARSE_WEIGHT, sparse)):
        for rank, doc in enumerate(ranked, start=1):
            chunk_id = doc.metadata["chunk_id"]
            by_id[chunk_id] = doc
            scores[chunk_id] = scores.get(chunk_id, 0.0) + weight / (RRF_K + rank)

    return [by_id[chunk_id] for chunk_id in sorted(scores, key=scores.get, reverse=True)]


def hybrid_search(
    query: str,
    policy_id: int | None = None,
    policy_type: str | None = None,
    user_id: int | None = None,
) -> list[Document]:
    """Dense (pgvector cosine) + sparse (Postgres full text) search fused with
    reciprocal rank fusion. Candidates come back in fused order, not yet
    reranked -- see `retrieve()` for the full pipeline.

    Scope: `user_id` restricts to that user's chunks; then `policy_id` (one
    policy) takes precedence over `policy_type` (all of the user's policies of
    that type).
    """
    query_embedding = get_embeddings().embed_query(query)
    scope = dict(policy_id=policy_id, policy_type=policy_type, user_id=user_id)

    def run_dense():
        with SessionLocal() as db:
            return chunk_store.dense_search(db, query_embedding, DENSE_FETCH_K, **scope)

    def run_sparse():
        with SessionLocal() as db:
            return chunk_store.sparse_search(db, query, SPARSE_FETCH_K, **scope)

    # Each query is sub-millisecond in Postgres; the time is the network round
    # trip to Neon, so overlap the two legs (separate sessions: one connection
    # can't run two queries at once).
    with ThreadPoolExecutor(max_workers=2) as pool:
        dense_future = pool.submit(run_dense)
        sparse_future = pool.submit(run_sparse)
        return _fuse(dense_future.result(), sparse_future.result())


def rerank(query: str, docs: list[Document], k: int = FINAL_K) -> tuple[list[Document], bool]:
    """Rerank with the Jina Reranker API. Returns (top-k docs, fell_back).

    On any API failure (timeout, 429, 5xx, bad response) logs a warning and
    returns the first k docs in their incoming (RRF-fused) order instead, so
    a reranker outage degrades ordering but never fails the chat.
    """
    if len(docs) <= 1:
        return docs[:k], False

    documents = [doc.page_content for doc in docs]
    estimated_tokens = (len(query) + sum(len(d) for d in documents)) // JINA_CHARS_PER_TOKEN

    try:
        # Never wait on the chat path: over budget means fall back right away.
        reservation = acquire(JINA_RATE_LIMIT_KEY, estimated_tokens, max_wait_s=0)
    except QuotaExceeded as e:
        logger.warning("Jina rerank skipped, using fused order: %s", e)
        return docs[:k], True

    try:
        resp = _rerank_session.post(
            JINA_RERANK_URL,
            headers={"Authorization": f"Bearer {JINA_API_KEY}"},
            json={
                "model": RERANKER_MODEL_NAME,
                "query": query,
                "documents": documents,
                "top_n": k,
                "return_documents": False,
            },
            timeout=RERANK_TIMEOUT_S,
        )
        resp.raise_for_status()
        body = resp.json()
        results = body["results"]
        record_usage(reservation, body.get("usage", {}).get("total_tokens"))

        return [docs[r["index"]] for r in results], False

    except (requests.RequestException, KeyError, ValueError, IndexError) as e:
        logger.warning("Jina rerank failed, using fused order: %s: %s", type(e).__name__, e)
        return docs[:k], True


def retrieve(
    query: str,
    policy_id: int | None = None,
    policy_type: str | None = None,
    user_id: int | None = None,
    k: int = FINAL_K,
) -> tuple[list[Document], dict]:
    """Hybrid retrieval + rerank. Returns (docs, info) where info carries
    `rerank` (seconds) and `rerank_fallback` (bool) for the timings dict."""
    candidates = hybrid_search(query, policy_id, policy_type, user_id)

    start = time.time()
    docs, fell_back = rerank(query, candidates, k)

    return docs, {"rerank": round(time.time() - start, 2), "rerank_fallback": fell_back}
