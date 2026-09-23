from rag.vectorstore import get_vectordb

vectordb = get_vectordb()

retriever = vectordb.as_retriever(
    search_type="mmr",
    search_kwargs={
        "k": 8,
        "fetch_k": 20
    }
)
