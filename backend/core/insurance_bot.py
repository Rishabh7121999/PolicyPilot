import time

from backend.chains.insurance_chain import chain

from backend.rag.retriever import retrieve


def _retrieve(query: str, policy_id: int | None, policy_type: str | None, user_id: int | None = None):
    """Returns (docs, info) -- see `backend.rag.retriever.retrieve`."""
    if policy_id is not None:
        return retrieve(query, policy_id=policy_id, user_id=user_id)

    if policy_type in ["health", "life", "motor"]:
        return retrieve(query, policy_type=policy_type, user_id=user_id)

    return retrieve(query, user_id=user_id)


def _build_context_and_sources(docs) -> tuple[str, list[str]]:
    context_parts = []
    sources = []
    seen = set()

    for doc in docs:
        policy_type = doc.metadata.get("policy_type") or "unknown"
        source_file = doc.metadata.get("source_file")
        page = doc.metadata.get("page")

        context_parts.append(
            f"[{policy_type} | {source_file}, p.{page}]\n{doc.page_content}"
        )

        source = f"{source_file} (Page {page})"
        if source not in seen:
            seen.add(source)
            sources.append(source)

    return "\n\n".join(context_parts), sources


def ask_insurance_bot_stream(
    query: str,
    chat_history: list[str],
    policy_id: int | None = None,
    policy_type: str | None = None,
    standalone_query: str | None = None,
    voice: bool = False,
    user_id: int | None = None,
) -> dict:
    """Retrieval, then streaming generation.

    Query rewriting and policy resolution happen upstream, in
    `backend.services.chat_service`, before this is called -- either via
    `backend.chains.policy_resolver` (unscoped chat) or
    `backend.chains.query_rewriter` (already policy-scoped chat).

    Returns immediately with the retrieval results (`sources`, `policy_type`,
    `rewritten_query`, `timings`) plus a `token_stream` generator that yields
    the answer text incrementally as the LLM produces it. `timings["llm_generation"]`
    is only populated once `token_stream` has been fully consumed.
    """

    timings = {}

    rewritten_query = standalone_query or query

    start = time.time()

    try:
        docs, retrieval_info = _retrieve(rewritten_query, policy_id, policy_type, user_id)
        timings.update(retrieval_info)
    except Exception as e:
        print(f"Retriever Error: {e}")
        docs = []

    timings["retrieval"] = round(time.time() - start, 2)

    context, sources = _build_context_and_sources(docs)

    style_instruction = (
        "Answer in 2-3 short spoken sentences. No markdown, no bullet lists, no tables. "
        "If the full details are long (e.g. a list of exclusions or hospital names), give the "
        "headline answer and say the complete details are shown on screen."
        if voice
        else ""
    )

    def token_stream():
        start_gen = time.time()

        for token in chain.stream({
            "history": "\n".join(chat_history),
            "context": context,
            "question": query,
            "style_instruction": style_instruction,
        }):
            yield token

        timings["llm_generation"] = round(time.time() - start_gen, 2)

    return {
        "sources": sources,
        "policy_type": policy_type,
        "rewritten_query": rewritten_query,
        "timings": timings,
        "token_stream": token_stream(),
    }
