# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A RAG-based voice/text assistant that answers questions about the user's insurance policies (Health and Life) by retrieving from a Chroma vector store built from policy PDFs, then generating answers with Gemini. FastAPI backend (`backend/`, including its `core`/`chains`/`rag`/`voice` submodules) + React/Vite/Tailwind frontend (`frontend/`) supporting multi-policy upload, structured policy summaries, and voice I/O (Whisper STT, Gemini TTS).

## Commands

This project uses `uv` for Python dependency management (see `pyproject.toml` / `uv.lock`) and `npm` for the frontend (see `frontend/package.json`).

```bash
# Install Python dependencies
uv sync

# Rebuild the vector database from the PDFs in data/ (bulk/manual reingest; add --rebuild to wipe and recreate)
uv run python -m backend.rag.ingest

# Run the FastAPI backend (from repo root; creates backend/policies.db on first boot)
uv run uvicorn backend.main:app --reload

# Run the frontend dev server (separate terminal, from frontend/)
cd frontend && npm install && npm run dev
```

The frontend expects the backend at `http://localhost:8000` (override via `frontend/.env`'s `VITE_API_BASE_URL`) and the backend's CORS allows `http://localhost:5173` (`backend/config.py:VITE_DEV_ORIGIN`).

There are no test, lint, or build scripts configured for the backend; the frontend has `npm run build` (tsc + vite build) but no test suite.

## Architecture

**Request flow** (`backend/core/insurance_bot.py:ask_insurance_bot(query, chat_history, policy_id=None)`) is the central orchestrator called by `backend/routers/chat.py`:

1. **Policy detection + query rewriting run in parallel** via `ThreadPoolExecutor` (`backend/chains/policy_detector.py`, `backend/chains/query_rewriter.py`). Query rewriting only runs if the query contains one of the trigger terms in `REWRITE_TERMS` (e.g. "acl", "waiting period", "copay") — otherwise the original query is used as-is, to save an LLM call.
2. **Retrieval** (`backend/rag/retriever.py:get_hybrid_retriever`): dense (Chroma MMR) + sparse (BM25) search fused via reciprocal rank fusion and reranked with a cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`). If `policy_id` is set, retrieval filters by `{"policy_id": str(policy_id)}` (most specific). Otherwise, if policy detection confidently returns `"health"` or `"life"`, it filters by `policy_type`. Otherwise (`"both"`/`"unknown"`), it falls back to the unfiltered hybrid+reranked `retriever`. BM25's corpus is an in-memory cache rebuilt from Chroma on demand — call `invalidate_bm25_cache()` after any `add_documents()`/`delete()` on the vector store.
3. **Context assembly**: retrieved docs are formatted into a text block carrying `policy_type`, `source_file`, and `page` metadata, and deduped into a `sources` list for citation.
4. **Generation** (`backend/chains/insurance_chain.py`): a Gemini (`gemini-2.5-flash-lite`) chain answers using only the retrieved context, chat history, and a rules-based prompt (handles ambiguous multi-policy questions, waiting-period deductive reasoning, and unmatched medical terms).

Each stage is timed and returned in `result["timings"]`. `backend/chains/clarification_chain.py` (detects ambiguous questions like "what is my premium?") is wired in only at the backend router level (`backend/routers/chat.py`, runs before `ask_insurance_bot` when `policy_id` is `None`) — `ask_insurance_bot` itself doesn't use it.

**Ingestion**: two paths write to the same shared Chroma collection at `vectordb/` (absolute path via `backend/rag/vectorstore.py:get_vectordb()`, derived from `backend/config.py:VECTORDB_DIR`).
- CLI (`uv run python -m backend.rag.ingest`): bulk/manual reingest of `data/` PDFs, per-policy-type via `PDF_FILES`; `--rebuild` wipes and recreates instead of the default `add_documents`.
- Upload flow (`backend/routers/policies.py:POST /policies/upload` → `backend/services/ingestion.py:run_ingestion_job`): saves the file, creates a `Policy` row (`status="processing"`), and runs via FastAPI `BackgroundTasks`. The actual PDF conversion is isolated in a subprocess (`backend/rag/ingest_worker.py`, invoked with `sys.executable -m backend.rag.ingest_worker`) because converting more than one PDF in-process triggers a flaky native segfault in Docling's dependency stack (loky/joblib teardown race) — the worker writes its result to a JSON tempfile that the parent process reads before doing DB/vector-store writes. On success, `status="ready"` with `summary_json`/`chunk_count`/`insurer`/`product_name` populated; on any exception, `status="failed"` with `error_message`.

Both paths use `backend/rag/loader.py` (Docling `DocumentConverter` + `HybridChunker`, structure-aware — keeps tables intact, unlike a blind character splitter) and tag each chunk with `policy_id`, `policy_type`, `source_file`, `page`, `section`, `chunk_index`.

**Structured extraction** (`backend/chains/policy_summary_chain.py`): `ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite").with_structured_output(PolicySummary)`, run once per upload against the full document text (Docling's markdown export, not retrieval chunks) to populate `Policy.summary_json`.

**Voice I/O**: `backend/voice/stt.py` transcribes with a local `faster-whisper` "base" model (CPU); `backend/voice/tts.py` synthesizes with Gemini TTS (`gemini-3.8-flash-lite-tts`) and returns WAV bytes directly (no fixed output file). `backend/routers/voice.py` exposes this as `POST /voice/transcribe` (multipart → tempfile, cleaned up after) and `POST /voice/speak` (returns the WAV bytes as `Response(media_type="audio/wav")`).

All LLM chains (`backend/chains/*.py`) are independent LangChain LCEL pipelines (`prompt | llm | parser`), each instantiating its own `ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", temperature=0)` client rather than sharing one.

**Backend** (`backend/`): FastAPI + SQLAlchemy 2.0 + SQLite (`backend/policies.db`, single `Policy` table, no Alembic — `Base.metadata.create_all` on startup). `backend/db.py:get_db()` is the request-scoped session dependency; `run_ingestion_job` opens its own `SessionLocal()` since it runs on Starlette's threadpool, not the request thread. Routers: `policies` (list/get/upload/delete), `chat` (`POST /chat`), `voice` (`POST /voice/transcribe`, `POST /voice/speak`). The `core`/`chains`/`rag`/`voice` submodules under `backend/` hold all the RAG/LLM/voice logic — there is no separate top-level package for it anymore.

**Frontend** (`frontend/`): Vite + React + TypeScript + Tailwind v4 (via `@tailwindcss/vite`, no `tailwind.config.js`). Routes: `/` (policy list + upload + delete), `/policies/:id` (polls `GET /policies/:id` every 2s while `status === "processing"`, renders `PolicySummaryCard` once `ready`), `/chat?policy_id=` (text + voice chat; voice records via `MediaRecorder` → `POST /voice/transcribe` → sends as a chat message → `POST /voice/speak` → plays via `Audio`). No state library — local `useState`/`useEffect` plus a small `usePolling` hook; `src/api/client.ts` is a thin `fetch` wrapper reading `VITE_API_BASE_URL` (defaults to `http://localhost:8000`).

## Known issues to be aware of

- The vector store may contain chunks from earlier CLI-based `backend.rag.ingest` runs without `policy_id` metadata, alongside chunks from the `/policies/upload` flow that do have it. Retrieval still works via `policy_type` filtering, but those legacy chunks aren't reachable via `policy_id`-scoped retrieval — a clean `--rebuild` + re-upload-through-the-API pass would fix this if it ever matters.
- A backend process restart mid-ingestion-job leaves the `Policy` row stuck at `status="processing"` forever (no retry queue) — recovery is deleting and re-uploading.
