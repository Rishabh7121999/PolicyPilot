"""Reads and writes the `chunks` table (Postgres + pgvector). This is the
vector store: it replaced the Chroma collection and the in-memory BM25 index.

Every query takes an optional `user_id`; chat paths always pass it so one
user's retrieval can never see another user's chunks.
"""

import re

from langchain_core.documents import Document
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from backend.models import Chunk
from backend.rag.vectorstore import get_embeddings

_WORD_RE = re.compile(r"[A-Za-z0-9]+")


def embed_documents(docs: list[Document]) -> list[list[float]]:
    """Embed outside any DB transaction: it's CPU-bound and takes seconds, and
    a Neon connection shouldn't sit idle in a transaction meanwhile."""
    return get_embeddings().embed_documents([d.page_content for d in docs])


def replace_policy_chunks(
    db: Session,
    policy_id: int,
    user_id: int | None,
    docs: list[Document],
    embeddings: list[list[float]],
) -> None:
    """Swap a policy's chunks for new ones inside the caller's transaction, so
    a failure anywhere rolls back to the old chunks (the caller commits)."""
    db.execute(delete(Chunk).where(Chunk.policy_id == policy_id))
    db.add_all(
        Chunk(
            policy_id=policy_id,
            user_id=user_id,
            policy_type=doc.metadata.get("policy_type"),
            source_file=doc.metadata["source_file"],
            page=doc.metadata.get("page"),
            section=doc.metadata.get("section"),
            chunk_index=doc.metadata.get("chunk_index", i),
            content=doc.page_content,
            embedding=embedding,
        )
        for i, (doc, embedding) in enumerate(zip(docs, embeddings))
    )


def set_policy_type(db: Session, policy_id: int, policy_type: str) -> None:
    db.execute(update(Chunk).where(Chunk.policy_id == policy_id).values(policy_type=policy_type))


def _filters(policy_id: int | None, policy_type: str | None, user_id: int | None) -> list:
    conditions = []
    if user_id is not None:
        conditions.append(Chunk.user_id == user_id)
    # Same precedence as before: a specific policy beats a policy type.
    if policy_id is not None:
        conditions.append(Chunk.policy_id == policy_id)
    elif policy_type:
        conditions.append(Chunk.policy_type == policy_type)
    return conditions


def _to_document(chunk: Chunk) -> Document:
    metadata = {
        "policy_id": str(chunk.policy_id),
        "source_file": chunk.source_file,
        "chunk_index": chunk.chunk_index,
        "chunk_id": chunk.id,
    }
    for key in ("policy_type", "page", "section"):
        value = getattr(chunk, key)
        if value is not None:
            metadata[key] = value
    return Document(page_content=chunk.content, metadata=metadata)


def dense_search(
    db: Session,
    query_embedding: list[float],
    k: int,
    policy_id: int | None = None,
    policy_type: str | None = None,
    user_id: int | None = None,
) -> list[Document]:
    """Nearest chunks by cosine distance, best first."""
    # Filtering by type/user is selective, and an HNSW scan alone would return
    # too few rows after filtering; iterative scan keeps searching. A single
    # policy needs no help: the planner uses the policy_id index instead (and
    # skipping this saves a network round trip).
    if policy_id is None:
        db.connection().exec_driver_sql("SET LOCAL hnsw.iterative_scan = relaxed_order")

    rows = db.execute(
        select(Chunk, Chunk.embedding.cosine_distance(query_embedding).label("distance"))
        .where(*_filters(policy_id, policy_type, user_id))
        .order_by("distance")
        .limit(k)
    ).all()

    return [_to_document(chunk) for chunk, _distance in rows]


def sparse_search(
    db: Session,
    query: str,
    k: int,
    policy_id: int | None = None,
    policy_type: str | None = None,
    user_id: int | None = None,
) -> list[Document]:
    """Keyword matches ranked by ts_rank_cd, best first.

    The question's words are OR-ed: `plainto_tsquery` ANDs them, which matches
    nothing for a natural-language question. Words are alphanumeric only, so
    nothing needs escaping, and the 'english' config drops stopwords.
    """
    words = _WORD_RE.findall(query)
    if not words:
        return []

    tsquery = func.to_tsquery("english", " | ".join(words))

    rows = db.execute(
        select(Chunk)
        .where(Chunk.tsv.op("@@")(tsquery), *_filters(policy_id, policy_type, user_id))
        .order_by(func.ts_rank_cd(Chunk.tsv, tsquery).desc())
        .limit(k)
    ).scalars()

    return [_to_document(chunk) for chunk in rows]
