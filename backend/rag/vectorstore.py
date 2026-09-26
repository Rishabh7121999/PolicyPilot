from langchain_chroma import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

from backend.config import VECTORDB_DIR

EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"

PERSIST_DIRECTORY = str(VECTORDB_DIR)

_embeddings = None
_vectordb = None


def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings

    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL_NAME)

    return _embeddings


def get_vectordb() -> Chroma:
    global _vectordb

    if _vectordb is None:
        _vectordb = Chroma(
            persist_directory=PERSIST_DIRECTORY,
            embedding_function=get_embeddings(),
        )

    return _vectordb
