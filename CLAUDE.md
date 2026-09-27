# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PolicyPilot** — a RAG-based voice/text assistant for Health, Life, and Motor insurance policies. Users upload policy PDFs with no manual tagging; the backend auto-classifies the policy type and extracts a structured summary, then answers questions by retrieving from a Chroma vector store and generating with Gemini. FastAPI backend (`backend/`, including its `core`/`chains`/`rag`/`voice`/`services` submodules) + React/Vite/Tailwind frontend (`frontend/`), with a sidebar-driven dashboard shell, a persistent multi-session Chat page, a floating quick-chat/voice assistant on every page, and voice I/O (Whisper STT, Gemini TTS) with silence-based auto-stop recording.

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

There are no test, lint, or build scripts configured for the backend; the frontend has `npm run build` (tsc + vite build), `npx oxlint src`, and `npx tsc -b`, but no test suite.

## Architecture

### Request flow

`backend/services/chat_service.py:answer_question(message, history, policy_id=None, db=None, voice=False)` is the shared entry point used by **both** chat surfaces (`backend/routers/chat.py`'s ephemeral `POST /chat` and `backend/routers/chat_sessions.py`'s persistent `POST /chat/sessions/{id}/messages`):

1. If `policy_id` is already known (a Chat page session pinned to a policy, or the floating assistant on a policy's detail page), it skips straight to retrieval+generation: `backend/chains/query_rewriter.py:rewrite_query(question, history)` always runs (no trigger-word gate) to fold chat history into a standalone search query — this is what makes follow-ups like "and the waiting period for that?" retrieve correctly — and the policy's `policy_type` is read directly off its `Policy` row (no LLM call needed).
2. Otherwise (unscoped chat), `backend/chains/policy_resolver.py:resolve_policy(question, history, policies)` makes one structured-output call that replaces the old separate clarification/policy-detection/rewrite steps: it rewrites the question into a standalone query, classifies `policy_type` (`health`/`life`/`motor`/`both`/`unknown`), and — grounded in the user's actual policy list (id/type/insurer/product name) plus chat history — either resolves a single `resolved_policy_id` unambiguously, or sets `needs_clarification` with a `clarification_question` and a list of candidate policies (only when the user genuinely has more than one policy of the relevant type and history doesn't narrow it down). A clarification response short-circuits before retrieval and carries `clarification_options: [{id, label}]` for the frontend to render as pickable chips; picking one persists that `policy_id` onto the session (via `PATCH /chat/sessions/{id}`) and the same question is re-asked, now scoped.
3. Either way, `backend/core/insurance_bot.py:ask_insurance_bot(query, chat_history, policy_id, policy_type, standalone_query, voice)` does retrieval + generation only (no LLM detection/rewrite calls of its own, so a turn costs at most one resolver-or-rewrite call plus one generation call):
   - **Retrieval** (`backend/rag/retriever.py:get_hybrid_retriever`): dense (Chroma MMR) + sparse (BM25) search fused via reciprocal rank fusion and reranked with a cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`). If `policy_id` is set, retrieval filters by `{"policy_id": str(policy_id)}` (most specific, and scopes to one specific policy rather than every policy of that type). Otherwise, if `policy_type` is `health`/`life`/`motor`, it filters by `policy_type`. Otherwise it falls back to the unfiltered hybrid+reranked `retriever`. BM25's corpus is an in-memory cache rebuilt from Chroma on demand — call `invalidate_bm25_cache()` after any `add_documents()`/`delete()`/metadata `update()` on the vector store.
   - **Context assembly**: retrieved docs are formatted into a text block carrying `policy_type`, `source_file`, and `page` metadata, and deduped into a `sources` list for citation.
   - **Generation** (`backend/chains/insurance_chain.py`): a Gemini (`gemini-3.5-flash-lite`) chain answers using only the retrieved context, chat history, and a rules-based prompt (handles ambiguous multi-policy questions, waiting-period deductive reasoning, and unmatched medical terms). When `voice=True`, an extra `style_instruction` asks for 2-3 short spoken sentences with no markdown/tables, deferring long details to what's on screen.

Each stage of `ask_insurance_bot` is timed and returned in `result["timings"]`.

### Chat: ephemeral vs. persistent

Two distinct surfaces share `answer_question` but serve different purposes:

- **Floating assistant** (`frontend/src/components/FloatingAssistant.tsx`, mounted once in `App.tsx`'s shell so it's present on every page except `/chat`): a lightweight FAB → panel with Chat/Voice tabs. No persistence — `messages` is component state that resets whenever the in-scope policy changes (via `useMatch('/policies/:id')`). Calls the stateless `POST /chat`. Off a policy page it's unscoped, so a clarification can occur; picking a candidate chip sets a local `scopedPolicyId` that stays in effect for the rest of that floating conversation (until the policy context changes), so follow-ups aren't re-asked.
- **Chat page** (`frontend/src/pages/ChatPage.tsx`, route `/chat`): a two-pane ChatGPT-style UI — a session list (left) and the active conversation (right). Backed by `backend/models.py:ChatSession`/`ChatMessage` (new tables, no Alembic needed since `Base.metadata.create_all` creates new tables automatically) and `backend/routers/chat_sessions.py`: `POST/GET /chat/sessions`, `GET/DELETE /chat/sessions/{id}`, `PATCH /chat/sessions/{id}` (change/clear a session's `policy_id` scope), `POST /chat/sessions/{id}/messages`. Sessions are created lazily on first message (not eagerly on page load); a session's `title` is naively set from the first ~60 chars of the first user message (not LLM-summarized). Optional `?policy_id=` query param scopes a new session to a policy, matching the floating assistant's "Full chat →" link. A scope picker in the page header lets the user change (or clear, back to "All policies") a session's `policy_id` at any point, via that `PATCH` endpoint — this is the primary way to avoid ambiguous multi-policy retrieval, with resolver-driven clarification chips (rendered from `ChatMessage.meta.clarification_options`, via `ChatBubble`) as the fallback for unscoped sessions.

### Ingestion

Two paths write to the same shared Chroma collection at `vectordb/` (absolute path via `backend/rag/vectorstore.py:get_vectordb()`, derived from `backend/config.py:VECTORDB_DIR`).
- CLI (`uv run python -m backend.rag.ingest`): bulk/manual reingest of `data/` PDFs, per-policy-type via `PDF_FILES`; `--rebuild` wipes and recreates instead of the default `add_documents`.
- Upload flow (`backend/routers/policies.py:POST /policies/upload` → `backend/services/ingestion.py:run_ingestion_job`): the user does **not** pick a policy type — the row is created with `policy_type="unknown"` and the background job classifies it. The actual PDF conversion is isolated in a subprocess (`backend/rag/ingest_worker.py`, invoked with `sys.executable -m backend.rag.ingest_worker`) because converting more than one PDF in-process triggers a flaky native segfault in Docling's dependency stack (loky/joblib teardown race) — the worker writes its result to a JSON tempfile that the parent process reads before doing DB/vector-store writes. The worker calls `extract_policy_summary(full_text)` itself and retroactively tags every chunk's metadata with the classified `policy_type` before returning (classification happens inside the same structured-output LLM call as the rest of the summary, not a separate round-trip). On success, `status="ready"` with `summary_json`, `chunk_count`, `insurer`, `product_name`, `policy_number`, `policy_type`, `sum_insured`/`sum_insured_numeric`, `policy_end_date`/`policy_end_date_iso` all promoted onto the `Policy` row; on any exception, `status="failed"` with `error_message`.
- `PATCH /policies/{id}` (body `{policy_type}`, one of `health`/`life`/`motor`) lets the user manually correct a wrong classification: updates the DB row and re-tags that policy's Chroma chunk metadata in place (`vectordb.get(where={"policy_id": ...})` then `vectordb._collection.update(...)`, then `invalidate_bm25_cache()`). It does **not** re-run extraction — overriding health→life won't retroactively populate `life_details`; only a re-upload does.
- `GET /policies/{id}/file` returns the original uploaded PDF (`FileResponse`) for the frontend's "Download Policy" button.

Both paths use `backend/rag/loader.py` (Docling `DocumentConverter` + `HybridChunker`, structure-aware — keeps tables intact, unlike a blind character splitter) and tag each chunk with `policy_id`, `policy_type` (omitted from metadata entirely, not written as `None`, when not yet known), `source_file`, `page`, `section`, `chunk_index`.

### Structured extraction

`backend/chains/policy_summary_chain.py`: `ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite").with_structured_output(PolicySummary)`, run once per upload against the full document text (Docling's markdown export, not retrieval chunks). `PolicySummary` includes:
- `policy_type: Literal["health","life","motor","unknown"]` — the LLM classifies from content (hospitalization/room rent/co-pay → health; sum assured/nominee/maturity → life; vehicle/IDV/registration → motor).
- One of `health_details` / `life_details` / `motor_details` populated (the other two `None`) with type-specific fields (e.g. health: room rent limit, pre/post-hospitalization days, co-pay %, network hospital info as free text; motor: IDV, NCB %, cashless garage network as free text — neither is a structured searchable directory, just what the document itself states).
- `faqs: list[FAQ]` — 4-6 policy-specific FAQs generated from the document.
- `sum_insured_numeric: float | None` and `policy_end_date_iso: str | None` — the LLM's own normalization (for dashboard aggregation/sorting); the raw string fields stay the source of truth for display.

### Voice I/O

Backend: `backend/voice/stt.py` transcribes with a local `faster-whisper` "base" model (CPU, `compute_type="int8"` for latency); `backend/voice/tts.py` synthesizes with Gemini TTS (`gemini-3.8-flash-lite-tts`). `speak(text)` returns one WAV `bytes` blob (used by `POST /voice/speak`); `split_sentences(text)` + `speak_stream(text)` synthesize sentence-by-sentence (merging fragments under ~20 chars into their neighbor to avoid choppy tiny clips) for `POST /voice/speak-stream`, which frames each sentence's WAV bytes as `[4-byte big-endian length][payload]` over a chunked `StreamingResponse` (`backend/routers/voice.py`) — the answer's own generation is still non-streaming, but TTS synthesis and playback are pipelined per sentence so audio starts well before the last sentence is synthesized. `POST /voice/transcribe` is unchanged (multipart → tempfile, cleaned up after).

Frontend: `frontend/src/hooks/useVoiceRecorder.ts` does real silence detection (Web Audio `AnalyserNode`, RMS over `getByteTimeDomainData`) instead of manual tap-to-stop — recording waits for the user to actually speak (ignores an initial silence window), then auto-stops ~1.4s after they go quiet, with a 30s hard cap. Both `FloatingAssistant` and `ChatPage` call this hook directly (rather than owning it inside `MicButton`) so they can drive it programmatically; `MicButton` is a controlled component (`recording`/`hasSpoken`/`onStart`/`onStop` props) plus a `speaking`/`onInterrupt` pair — tapping it while the assistant is talking stops playback and starts recording immediately (manual barge-in; there's no automatic voice-activity interruption during playback, since an always-on mic during TTS output risks picking up the speaker's own audio as false speech without guaranteed echo cancellation). `frontend/src/lib/audioQueue.ts:AudioQueuePlayer` consumes `speakTextStream` (`frontend/src/api/client.ts`, parses the length-prefixed frames) and plays each sentence's blob back-to-back via a single `<audio>` element, calling `onDone` once the queue drains; both surfaces use that to drive an opt-in "Hands-free" toggle that auto-restarts recording after the answer finishes playing, for a continuous voice-mode loop without a full realtime/speech-to-speech rearchitecture. `voice: true` is threaded through `ChatRequest`/`ChatSessionMessageCreate` for voice-originated turns, to get the shorter spoken-style answer from `ask_insurance_bot`. Both `FloatingAssistant` and `ChatPage` render the live transcript and the bot's text answer immediately (not just audio) — voice mode never jumps to a different tab/view.

All LLM chains (`backend/chains/*.py`) are independent LangChain LCEL pipelines (`prompt | llm | parser`), each instantiating its own `ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", temperature=0)` client rather than sharing one.

### Backend

FastAPI + SQLAlchemy 2.0 + SQLite (`backend/policies.db`, no Alembic — `Base.metadata.create_all` on startup creates new tables, and `backend/db.py:sync_columns()` (called right after, from `main.py`'s `lifespan`) diffs `Base.metadata` against live `PRAGMA table_info` and issues `ALTER TABLE ... ADD COLUMN` for any columns missing from existing tables — the closest thing this project has to a migration). `backend/db.py:get_db()` is the request-scoped session dependency; `run_ingestion_job` opens its own `SessionLocal()` since it runs on Starlette's threadpool, not the request thread.

Routers: `policies` (list/get/upload/delete/patch-type/download-file), `chat` (`POST /chat`, ephemeral), `chat_sessions` (`/chat/sessions*`, persistent, including `PATCH /chat/sessions/{id}` to change scope), `voice` (`POST /voice/transcribe`, `POST /voice/speak`, `POST /voice/speak-stream`). The `core`/`chains`/`rag`/`voice`/`services` submodules under `backend/` hold all the RAG/LLM/voice/orchestration logic.

`Policy` columns beyond the obvious: `policy_number`, `sum_insured` (str) + `sum_insured_numeric` (float), `policy_end_date` (str) + `policy_end_date_iso` (str) — all nullable, added via `sync_columns()` rather than a fresh migration.

### Frontend

Vite + React 19 + TypeScript + React Router 7 + Tailwind v4 (via `@tailwindcss/vite`, no `tailwind.config.js` — palette tokens live as `@theme` custom properties in `frontend/src/index.css`: `sage`, `teal`, `cream`, `peach`, `beige`). **Light theme only, by design** — there is no dark mode; `color-scheme: light` is set explicitly and no component uses `dark:` variants, since the calm sage/cream palette from `UIUX.md` is the one intended look, not something to auto-invert.

`frontend/src/App.tsx` is the authenticated shell: `Sidebar` (Home/My Policies/Upload Policy/Chat/Reminders/Profile) + `Topbar` (search input is visual-only, no backend search endpoint) + `<Outlet/>` + `FloatingAssistant`, all inside a `h-screen overflow-hidden` layout where only the `<main>` content area scrolls (sidebar/topbar stay pinned). `frontend/src/context/AppShellContext.tsx` shares upload-dialog open/close state and a `policiesVersion` refresh counter across pages without prop drilling.

Routes (`frontend/src/router.tsx`): `/login` (outside the shell, `LoginPage` — **cosmetic only**, no real backend auth, single-user local app) and, inside the shell: `/` (`HomePage` dashboard: stat cards + recent policies), `/policies` (`PolicyListPage`: type filter chips, `PolicyCard` grid, drag-and-drop upload with progress via `XMLHttpRequest`), `/policies/:id` (`PolicyDetailPage`: header + `PolicyDetailTabs` — Overview/What's Covered/Claim Process/Cashless Hospitals/FAQs — plus a manual policy-type override control), `/chat` (`ChatPage`, see above), `/reminders` (`RemindersPage`: ready policies sorted by `policy_end_date_iso`), `/profile` (static placeholder, no real accounts).

`src/api/client.ts` is a thin wrapper: `fetch` for JSON endpoints, `XMLHttpRequest` for `uploadPolicy` specifically (needed for `xhr.upload.onprogress` — `fetch` can't report upload progress). No state library — local `useState`/`useEffect` plus a small `usePolling` hook (`PolicyDetailPage` polls every 2s while `status === "processing"`).

## Known issues to be aware of

- The vector store may contain chunks from earlier CLI-based `backend.rag.ingest` runs without `policy_id` metadata, alongside chunks from the `/policies/upload` flow that do have it. Retrieval still works via `policy_type` filtering, but those legacy chunks aren't reachable via `policy_id`-scoped retrieval — a clean `--rebuild` + re-upload-through-the-API pass would fix this if it ever matters.
- A backend process restart mid-ingestion-job leaves the `Policy` row stuck at `status="processing"` forever (no retry queue) — recovery is deleting and re-uploading.
- `PATCH /policies/{id}` fixes the type label and retrieval filtering but never re-runs extraction, so a corrected type won't retroactively gain that type's `*_details` — only a fresh upload populates those.
- "Cashless Hospitals"/garage network info is whatever free text the policy document itself states — there's no directory, search, or maps/geolocation integration, by design.
- Chat session titles are a naive first-message truncation, not LLM-generated summaries.
- The login page is cosmetic; there is no session/account system anywhere in the backend.
