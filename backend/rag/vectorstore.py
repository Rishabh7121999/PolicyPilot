import os

from fastembed import TextEmbedding
from langchain_core.embeddings import Embeddings

from backend.config import BASE_DIR

# Runs locally on ONNX Runtime via fastembed -- no torch, no API quota. The
# `chunks.embedding` column is sized to this model (models.py:EMBEDDING_DIM), so
# changing it needs a migration plus a re-index.
EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"

# Where fastembed keeps the downloaded ONNX model. Its default is a temp dir
# the OS may clear; in a container image, point this at a baked-in path.
EMBEDDING_CACHE_DIR = os.getenv("FASTEMBED_CACHE_PATH", str(BASE_DIR / ".cache" / "fastembed"))

_embeddings = None


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
