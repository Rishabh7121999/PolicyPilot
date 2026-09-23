import time
from concurrent.futures import ThreadPoolExecutor

from chains.query_rewriter import query_rewriter
from chains.policy_detector import policy_detector
from chains.insurance_chain import chain

from rag.retriever import retriever, vectordb


REWRITE_TERMS = [
    "acl",
    "waiting period",
    "copay",
    "co-pay",
    "deductible",
    "critical illness",
    "pre existing",
    "pre-existing"
]


def detect_policy(query):
    return policy_detector.invoke(
        {"question": query}
    ).strip().lower()


def rewrite_query(query):
    return query_rewriter.invoke(
        {"question": query}
    )


def ask_insurance_bot(query, chat_history):

    timings = {}

    query_lower = query.lower()

    needs_rewrite = any(
        term in query_lower
        for term in REWRITE_TERMS
    )

    # ---------------------------------
    # Policy Detection + Rewrite
    # ---------------------------------

    start = time.time()

    with ThreadPoolExecutor(max_workers=2) as executor:

        policy_future = executor.submit(
            detect_policy,
            query
        )

        rewrite_future = None

        if needs_rewrite:

            rewrite_future = executor.submit(
                rewrite_query,
                query
            )

        policy_type = policy_future.result()

        if rewrite_future:

            rewritten_query = rewrite_future.result()

            if len(rewritten_query) > 300:
                rewritten_query = query

        else:

            rewritten_query = query

    timings["policy_detection_and_query_rewriting"] = round(
        time.time() - start,
        2
    )

    # ---------------------------------
    # Retrieval
    # ---------------------------------

    start = time.time()

    try:

        if policy_type in ["health", "life"]:

            docs = vectordb.similarity_search(
                rewritten_query,
                k=5,
                filter={
                    "policy_type": policy_type
                }
            )

        else:

            docs = retriever.invoke(
                rewritten_query
            )

    except Exception as e:

        print(f"Retriever Error: {e}")
        docs = []

    timings["retrieval"] = round(
        time.time() - start,
        2
    )

    # ---------------------------------
    # Context
    # ---------------------------------

    context_parts = []

    for doc in docs:

        context_parts.append(
            f"""
Policy Type:
{doc.metadata.get('policy_type')}

Source:
{doc.metadata.get('source_file')}

Page:
{doc.metadata.get('page')}

Content:
{doc.page_content}
"""
        )

    context = "\n\n".join(context_parts)

    # ---------------------------------
    # Sources
    # ---------------------------------

    sources = []

    seen = set()

    for doc in docs:

        source = (
            f"{doc.metadata.get('source_file')} "
            f"(Page {doc.metadata.get('page')})"
        )

        if source not in seen:

            seen.add(source)
            sources.append(source)

    # ---------------------------------
    # LLM
    # ---------------------------------

    start = time.time()

    answer = chain.invoke({
        "history": "\n".join(chat_history),
        "context": context,
        "question": query
    })

    timings["llm_generation"] = round(
        time.time() - start,
        2
    )

    return {
        "answer": answer,
        "sources": sources,
        "policy_type": policy_type,
        "rewritten_query": rewritten_query,
        "timings": timings
    }