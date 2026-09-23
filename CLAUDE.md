# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A RAG-based voice/text assistant that answers questions about the user's insurance policies (Health and Life) by retrieving from a Chroma vector store built from policy PDFs, then generating answers with Gemini. Supports both a Streamlit text/voice chat UI and voice I/O (Whisper STT, ElevenLabs TTS).

## Commands

This project uses `uv` for dependency management (see `pyproject.toml` / `uv.lock`).

```bash
# Install dependencies
uv sync

# Run the Streamlit app (main UI)
uv run streamlit run app.py

# Rebuild the vector database from the PDFs in data/
cd rag && uv run python ingest.py
```

There are no test, lint, or build scripts configured in this repo.

## Architecture

**Request flow** (`core/insurance_bot.py:ask_insurance_bot`) is the central orchestrator called by `app.py`:

1. **Policy detection + query rewriting run in parallel** via `ThreadPoolExecutor` (`chains/policy_detector.py`, `chains/query_rewriter.py`). Query rewriting only runs if the query contains one of the trigger terms in `REWRITE_TERMS` (e.g. "acl", "waiting period", "copay") — otherwise the original query is used as-is, to save an LLM call.
2. **Retrieval** (`rag/retriever.py`): if policy detection confidently returns `"health"` or `"life"`, retrieval uses `vectordb.similarity_search` filtered by `policy_type` metadata. Otherwise (`"both"`/`"unknown"`), it falls back to the unfiltered MMR `retriever`.
3. **Context assembly**: retrieved docs are formatted into a text block carrying `policy_type`, `source_file`, and `page` metadata, and deduped into a `sources` list for citation.
4. **Generation** (`chains/insurance_chain.py`): a Gemini (`gemini-2.5-flash-lite`) chain answers using only the retrieved context, chat history, and a rules-based prompt (handles ambiguous multi-policy questions, waiting-period deductive reasoning, and unmatched medical terms).

Each stage is timed and returned in `result["timings"]` for the Streamlit performance metrics panel. `chains/clarification_chain.py` exists (detects ambiguous questions like "what is my premium?") but is not currently wired into `ask_insurance_bot`.

**Ingestion** (`rag/ingest.py`): loads PDFs per-policy-type from `PDF_FILES`, tags each page's metadata with `policy_type` and `source_file`, chunks with `RecursiveCharacterTextSplitter` (1000/200), embeds with local `HuggingFaceEmbeddings` (`BAAI/bge-small-en-v1.5` — not Gemini embeddings, despite `GoogleGenerativeAIEmbeddings` being imported), and persists to `../vectordb` via Chroma. **Note:** `ingest.py` uses relative paths (`../data`, `../vectordb`) and must be run with `rag/` as the working directory; `rag/retriever.py` uses `./vectordb` and must be run from the repo root — this asymmetry is a known footgun when adding new policy PDFs.

**Voice I/O**: `voice/stt.py` transcribes with a local `faster-whisper` "base" model (CPU); `voice/tts.py` synthesizes with ElevenLabs, always writing to `response.mp3`.

All LLM chains (`chains/*.py`) are independent LangChain LCEL pipelines (`prompt | llm | parser`), each instantiating its own `ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=0)` client rather than sharing one.

## Known issues to be aware of

- `voice/tts.py` has a hardcoded ElevenLabs API key rather than reading from `.env`/`GOOGLE_API_KEY`-style config — flag this if touching that file.
- `streamlit.py` at the repo root is a stray/scratch file (unrelated to `app.py`, the real entrypoint) — don't confuse the two.
- `test.ipynb`, `temp.wav`, and `response.mp3` are working scratch artifacts, not part of the app.
