import logging
import time

import requests
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_classic.retrievers import EnsembleRetriever

from backend.config import JINA_API_KEY
from backend.core.rate_limiter import QuotaExceeded, acquire, record_usage
from backend.rag.vectorstore import get_vectordb

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

vectordb = get_vectordb()

_rerank_session = requests.Session()
_bm25_corpus_docs: list[Document] | None = None


def _load_corpus() -> list[Document]:
    """Pull every chunk out of Chroma to build the BM25 (keyword) index from.

    BM25 has no notion of a persistent index the way Chroma does -- it's an
    in-memory structure over a fixed document list, so it has to be rebuilt
    from the vector store's contents. Fine at this app's scale (thousands of
    chunks, not millions).
    """
    raw = vectordb.get(include=["documents", "metadatas"])

    return [
        Document(page_content=text, metadata=metadata or {})
        for text, metadata in zip(raw["documents"], raw["metadatas"])
    ]


def invalidate_bm25_cache() -> None:
    """Call after add_documents()/delete() so the next query rebuilds the BM25 index."""
    global _bm25_corpus_docs
    _bm25_corpus_docs = None


def _get_bm25_corpus() -> list[Document]:
    global _bm25_corpus_docs

    if _bm25_corpus_docs is None:
        _bm25_corpus_docs = _load_corpus()

    return _bm25_corpus_docs


def _matches_filter(doc: Document, metadata_filter: dict | None) -> bool:
    if not metadata_filter:
        return True

    return all(doc.metadata.get(key) == value for key, value in metadata_filter.items())


def get_hybrid_retriever(metadata_filter: dict | None = None) -> BaseRetriever:
    """Dense (Chroma/MMR) + sparse (BM25) retrieval, fused with reciprocal
    rank fusion. Returns candidates in fused order, not yet reranked -- see
    `retrieve()` for the full pipeline.

    metadata_filter: e.g. {"policy_type": "health"} or {"policy_id": "3"}.
    """
    dense_search_kwargs = {"k": DENSE_FETCH_K, "fetch_k": DENSE_FETCH_K * 3}

    if metadata_filter:
        dense_search_kwargs["filter"] = metadata_filter

    dense_retriever = vectordb.as_retriever(
        search_type="mmr",
        search_kwargs=dense_search_kwargs,
    )

    corpus = _get_bm25_corpus()
    filtered_corpus = [doc for doc in corpus if _matches_filter(doc, metadata_filter)]

    # BM25Retriever errors on an empty corpus (e.g. a brand-new, empty vector
    # store) -- fall back to dense-only in that case.
    if not filtered_corpus:
        return dense_retriever

    bm25_retriever = BM25Retriever.from_documents(filtered_corpus)
    bm25_retriever.k = min(SPARSE_FETCH_K, len(filtered_corpus))

    return EnsembleRetriever(
        retrievers=[dense_retriever, bm25_retriever],
        weights=[0.5, 0.5],
    )


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
    metadata_filter: dict | None = None,
    k: int = FINAL_K,
) -> tuple[list[Document], dict]:
    """Hybrid retrieval + rerank. Returns (docs, info) where info carries
    `rerank` (seconds) and `rerank_fallback` (bool) for the timings dict."""
    candidates = get_hybrid_retriever(metadata_filter).invoke(query)

    start = time.time()
    docs, fell_back = rerank(query, candidates, k)

    return docs, {"rerank": round(time.time() - start, 2), "rerank_fallback": fell_back}
