import os

from fastembed import TextEmbedding
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings

from backend.config import BASE_DIR, VECTORDB_DIR

# Runs locally on ONNX Runtime via fastembed -- no torch, no API quota.
EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"

# Versioned by embedding model + dimensions: vectors from different models
# live in different spaces, so a model change must never write into (or
# query) an existing collection. Re-index with `backend.rag.ingest --reindex-all`.
COLLECTION_NAME = "policies_bge384"

# Where fastembed keeps the downloaded ONNX model. Its default is a temp dir
# the OS may clear; in a container image, point this at a baked-in path.
EMBEDDING_CACHE_DIR = os.getenv("FASTEMBED_CACHE_PATH", str(BASE_DIR / ".cache" / "fastembed"))

PERSIST_DIRECTORY = str(VECTORDB_DIR)

_embeddings = None
_vectordb = None


class LocalEmbeddings(Embeddings):
    """bge-small-en-v1.5 via fastembed. Outputs are already unit-length."""

    def __init__(self):
        self._model = TextEmbedding(EMBEDDING_MODEL_NAME, cache_dir=EMBEDDING_CACHE_DIR)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [vector.tolist() for vector in self._model.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        return next(iter(self._model.query_embed(text))).tolist()


def get_embeddings() -> Embeddings:
    global _embeddings

    if _embeddings is None:
        _embeddings = LocalEmbeddings()

    return _embeddings


def get_vectordb() -> Chroma:
    global _vectordb

    if _vectordb is None:
        _vectordb = Chroma(
            collection_name=COLLECTION_NAME,
            persist_directory=PERSIST_DIRECTORY,
            embedding_function=get_embeddings(),
            collection_metadata={"hnsw:space": "cosine"},
        )

    return _vectordb
