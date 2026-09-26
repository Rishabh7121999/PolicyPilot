from langchain_community.cross_encoders import HuggingFaceCrossEncoder
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from langchain_classic.retrievers import ContextualCompressionRetriever, EnsembleRetriever
from langchain_classic.retrievers.document_compressors import CrossEncoderReranker

from backend.rag.vectorstore import get_vectordb

RERANKER_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# How many candidates each leg of the hybrid search pulls before fusion/reranking.
DENSE_FETCH_K = 20
SPARSE_FETCH_K = 20
# Final number of chunks handed to the LLM, after cross-encoder reranking.
FINAL_K = 8

vectordb = get_vectordb()

_cross_encoder = None
_bm25_corpus_docs: list[Document] | None = None


def _get_cross_encoder() -> HuggingFaceCrossEncoder:
    global _cross_encoder

    if _cross_encoder is None:
        _cross_encoder = HuggingFaceCrossEncoder(model_name=RERANKER_MODEL_NAME)

    return _cross_encoder


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


def get_hybrid_retriever(
    metadata_filter: dict | None = None,
    k: int = FINAL_K,
) -> ContextualCompressionRetriever:
    """Dense (Chroma/MMR) + sparse (BM25) retrieval, fused with reciprocal rank
    fusion, then reranked by a cross-encoder for the final top-k.

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
        base_retriever = dense_retriever
    else:
        bm25_retriever = BM25Retriever.from_documents(filtered_corpus)
        bm25_retriever.k = min(SPARSE_FETCH_K, len(filtered_corpus))

        base_retriever = EnsembleRetriever(
            retrievers=[dense_retriever, bm25_retriever],
            weights=[0.5, 0.5],
        )

    reranker = CrossEncoderReranker(model=_get_cross_encoder(), top_n=k)

    return ContextualCompressionRetriever(
        base_compressor=reranker,
        base_retriever=base_retriever,
    )


# Unfiltered hybrid+reranked retriever, used when policy detection can't
# confidently narrow the search to one policy_type.
retriever = get_hybrid_retriever()
