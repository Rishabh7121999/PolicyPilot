# Insurance Voicebot → Structured Policy App

## Context

The project today is a single-PDF-pair RAG chatbot: `rag/ingest.py` loads two hardcoded PDFs with `PyPDFLoader` (which flattens tables — sum-insured schedules, waiting-period grids, benefit tables — into garbled inline text) and slices them with a blind `RecursiveCharacterTextSplitter(1000/200)` that ignores section boundaries. Retrieval quality suffers because chunks can separate a waiting-period label from its value, or split a table mid-row.

The user wants two things beyond a better chatbot:
1. **Better chunking** for these insurance PDFs, so retrieval is grounded in real document structure instead of arbitrary character counts.
2. **A single view that surfaces key policy information at a glance** (sum insured, premium, dates, waiting periods, exclusions, etc.) instead of making the user read the raw PDF — and this should support **multiple policies**, including future user uploads, not just the two hardcoded PDFs.

Through discussion, this grew into a decision to build a real application now rather than bolt this onto Streamlit: a **FastAPI backend** + **React/Vite/Tailwind frontend**, with **Docling** doing structure-aware PDF parsing (chosen over cloud parsers because these PDFs carry real PII — name, address, policy numbers — and the project is local-first already), a **SQLite policy-indexed store** (not a single JSON file, so it scales to multiple policies/uploads), **upload-through-the-UI** running the full pipeline as a background job, and **voice I/O** carried into the new frontend from day one.

The existing Streamlit app (`app.py`) stays in place as a legacy UI and is not required to be torn out — the design deliberately reuses `core/`, `chains/`, `rag/`, `voice/` by import so both UIs share the same vector store and chat logic.

## Repo layout (new vs. reused)

```
core/insurance_bot.py          MODIFIED — add optional policy_id param (backward compatible)
chains/
  policy_detector.py            unchanged, reused
  query_rewriter.py             unchanged, reused
  insurance_chain.py            unchanged, reused
  clarification_chain.py        unchanged, wired in at backend router level (not inside ask_insurance_bot)
  policy_summary_chain.py       NEW — PolicySummary schema + Gemini structured-output extraction chain
rag/
  vectorstore.py                NEW — shared embeddings singleton + absolute-path Chroma instance
  loader.py                     NEW — Docling convert + HybridChunker -> list[Document] + full_text
  ingest.py                     REWRITTEN — CLI for bulk/manual reingest of data/, uses loader.py + vectorstore.py
  retriever.py                  MODIFIED (small) — imports from vectorstore.py instead of duplicating
voice/
  stt.py                        unchanged, reused
  tts.py                        REWRITTEN — API key from .env, speak() returns bytes not a fixed file path
app.py                          unchanged (legacy Streamlit UI)
backend/                        NEW
  main.py                       FastAPI app, CORS, router mounting, DB init on startup
  config.py                     absolute paths (DB, uploads dir, vectordb dir), env
  db.py                         SQLAlchemy engine/session + get_db() dependency
  models.py                     Policy ORM model
  schemas.py                    Pydantic request/response models (imports PolicySummary from chains/)
  routers/
    policies.py                 list / get / upload / delete
    chat.py                     POST /chat
    voice.py                    POST /voice/transcribe, POST /voice/speak
  services/
    ingestion.py                run_ingestion_job(policy_id): the background pipeline
  uploads/                      gitignored — uploaded PDFs at {policy_id}/{filename}
frontend/                       NEW — Vite + React + TS + Tailwind SPA
```

**Key design choice:** one shared Chroma collection at the existing `vectordb/` path. The new upload pipeline adds to it (rather than rebuilding), so anything uploaded through the new backend is immediately visible to the legacy Streamlit app too. This is what lets `core/insurance_bot.py`, `rag/retriever.py`, and all of `chains/*.py` be reused unchanged.

## Phase 0 — Hygiene (do first)

The repo has **no git commits yet**, and `.gitignore` currently only excludes `__pycache__`/`.venv`. Two real issues to fix before anything else, since there's no history to clean up yet:
- `voice/tts.py` has a **hardcoded, live ElevenLabs API key** in source (`client = ElevenLabs(api_key="sk_...")`). Move it to `.env` as `ELEVENLABS_API_KEY`. Flag to the user that they should rotate this key on ElevenLabs' dashboard regardless, since it's been visible in a readable file.
- Update `.gitignore` to add `data/` (real PII PDFs), `vectordb/`, `.env`, `*.db`, `backend/uploads/`, `response.mp3`, `temp.wav`.

## Phase 1 — Backend skeleton + DB

Add `backend/config.py`, `db.py`, `models.py`, `schemas.py`, `main.py`.

`Policy` model (SQLAlchemy 2.0 declarative, `backend/models.py`):
- `id`, `policy_type` ("health"/"life"), `insurer`, `product_name`, `source_file`, `file_path`, `status` (processing/ready/failed), `error_message`, `summary_json` (JSON column), `chunk_count`, `created_at`, `updated_at`.

`backend/db.py`: `sqlite:///backend/policies.db`, `connect_args={"check_same_thread": False}` (required since the background job runs on a threadpool thread and opens its own `SessionLocal()` rather than reusing the request-scoped session). `Base.metadata.create_all(engine)` on startup — no Alembic, single-table personal app.

`main.py` wires CORS (allow the Vite dev origin) and mounts routers. Start with just `GET /policies` and `GET /policies/{id}` to verify the skeleton boots.

## Phase 2 — Docling pipeline in isolation

`rag/vectorstore.py`: absolute-path `PERSIST_DIRECTORY` (fixes the ingest.py-vs-retriever.py relative-path asymmetry noted in CLAUDE.md), lazy singleton `get_embeddings()` / `get_vectordb()`.

`rag/loader.py` (the highest-risk new piece): use `docling.document_converter.DocumentConverter` to parse the PDF, then `docling_core`'s `HybridChunker` to chunk along document structure. Map each chunk to a LangChain `Document` with metadata: `policy_id`, `policy_type`, `source_file`, `page`, `section` (heading breadcrumb), `chunk_index`. Also return `full_text` (`dl_doc.export_to_markdown()`) for the extraction chain in Phase 3 — Docling's markdown export keeps tables intact as coherent markdown, unlike concatenated retrieval chunks.

Known rough edges to expect: Docling downloads layout/TableFormer models from HF Hub on first run (same pattern as the existing `HuggingFaceEmbeddings` first-run download); CPU table/layout inference is meaningfully slower than `PyPDFLoader` (~10–30s+ for a 50-page digital PDF) — this is why ingestion must be a background job, not incidental; the 4 existing PDFs are digital-text so Docling's default (non-OCR) pipeline should suffice — OCR support is a known gap, not built now; verify the exact `HybridChunker`/`chunk.meta` attribute names against whatever `docling-core` version `uv add docling` resolves, since this API has shifted across releases.

`rag/ingest.py` rewritten as a CLI using `loader.py` + `vectorstore.py`, iterating the existing `PDF_FILES` dict, `add_documents` instead of full rebuild by default (keep a `--rebuild` flag for the old wipe-and-recreate behavior). `rag/retriever.py` shrinks to importing from `vectorstore.py` and re-exporting `vectordb`/`retriever` under existing names — zero changes needed in `core/insurance_bot.py` or `app.py` for retrieval to keep working.

**Validate this phase end-to-end before continuing**: run the CLI against the 4 existing `data/` PDFs, spot-check that chunks contain intact table content, and confirm `app.py` still answers correctly.

## Phase 3 — Structured extraction, standalone

`chains/policy_summary_chain.py`, following the existing `chains/*.py` LCEL pattern:
- Pydantic `WaitingPeriod {condition, duration}` and `PolicySummary` (policy_number, insurer, product_name, policyholder_name, sum_insured, premium_amount, premium_due_date, policy_start_date, policy_end_date, plan_variant, riders: list[str], waiting_periods: list[WaitingPeriod], key_exclusions: list[str], nominee, claim_process_summary) — all fields optional since not every field applies to every policy type.
- `ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite").with_structured_output(PolicySummary)`, prompted with the full document text.
- **Feed it the full `full_text` from `rag/loader.py`**, not a heading-matched subset: Gemini 2.5 Flash-Lite's 1M-token context makes size a non-issue even for 50 pages, this runs once per policy as an already-budgeted background job, and matching on section headings would be brittle (insurers phrase things inconsistently) for a savings that doesn't matter here.

Test standalone by running it against one seed PDF's `full_text` and eyeballing the JSON before wiring into the backend.

## Phase 4 — Wire ingestion into a real upload flow

`backend/services/ingestion.py::run_ingestion_job(policy_id)`: opens its own DB session, loads the row, calls `parse_and_chunk`, `get_vectordb().add_documents(...)`, calls `extract_policy_summary(full_text)`, writes `summary_json`/`chunk_count`/`status="ready"`; on any exception sets `status="failed"` + `error_message`.

`backend/routers/policies.py`:
- `POST /policies/upload` — multipart (`file`, `policy_type` supplied by the user, not auto-classified). Creates the row (`status="processing"`), saves to `backend/uploads/{id}/{filename}`, schedules `background_tasks.add_task(run_ingestion_job, policy.id)` (FastAPI's `BackgroundTasks` runs sync functions via Starlette's threadpool — no Celery/Redis needed), returns `{id, status}` immediately.
- `GET /policies` — lightweight list (excludes `summary_json`).
- `GET /policies/{id}` — full row incl. `summary_json`; the frontend polls this during ingestion.
- `DELETE /policies/{id}` — removes the Chroma chunks (`vectordb.delete(where={"policy_id": str(id)})`), the uploaded file, and the row.

A process restart mid-job leaves a row stuck at `"processing"` — acceptable for a personal app (no retry queue; recovery is re-upload). Validate with a manual `curl -F` upload against a seed PDF, poll until `ready`.

## Phase 5 — Chat + voice endpoints

`core/insurance_bot.py`: add optional trailing `policy_id=None` param. When set, retrieval filters by `{"policy_id": str(policy_id)}` (most specific — correct even with multiple same-type policies); otherwise falls back to today's `policy_type` filter, then the unfiltered MMR retriever. `app.py` is unaffected (still calls it with 2 positional args).

`backend/routers/chat.py`: `POST /chat {message, history, policy_id}`. When `policy_id` is `None`, runs `chains/clarification_chain.py` first and returns early if ambiguous — this is where clarification finally gets wired in, at the router level only, so Streamlit's flow is untouched. Otherwise calls `ask_insurance_bot`.

`voice/tts.py` rewritten: API key from `.env`, `speak(text) -> bytes` instead of writing `response.mp3`. (Non-breaking for `app.py`: `st.audio()` accepts bytes directly.)

`backend/routers/voice.py`: `POST /voice/transcribe` (multipart audio → `tempfile.NamedTemporaryFile`, never a fixed path, cleaned up in `finally`) and `POST /voice/speak` (returns `Response(audio_bytes, media_type="audio/mpeg")` — no shared file, safe under concurrent requests).

Confirm `app.py` still works after the `tts.py` change.

## Phase 6 — Frontend (Vite + React + TypeScript + Tailwind)

```
frontend/src/
  main.tsx, App.tsx, router.tsx        # "/", "/policies/:id", "/chat"
  api/client.ts                        # fetch wrapper
  pages/
    PolicyListPage.tsx                 # GET /policies, upload dialog, delete
    PolicyDetailPage.tsx               # GET /policies/:id; polls ~2s while status=="processing"
    ChatPage.tsx                       # text + voice chat, optional policy-scope selector
  components/
    UploadPolicyDialog.tsx, PolicySummaryCard.tsx, StatusBadge.tsx,
    ChatBubble.tsx, SourceList.tsx, MicButton.tsx
```

No Redux/Zustand — local `useState`/`useEffect` per page plus a small `usePolling` hook. Chat history as component state (mirrors `app.py`'s flat `st.session_state.history` list). Voice: `MediaRecorder` → blob → `POST /voice/transcribe` → send as chat message → after reply, `POST /voice/speak` → play via `Audio`.

Build order within this phase: scaffold → policy list + upload + polling detail view (testable against Phase 4 alone) → text-only chat → voice last (fiddliest browser APIs, best done once text chat works).

## New dependencies

Backend (`uv add`): `docling`, `sqlalchemy>=2.0`, `python-multipart` (required for `UploadFile`/form parsing, not currently present). Everything else (`fastapi`, `uvicorn`, `chromadb`, `langchain[google-genai]`, `langchain-chroma`, `python-dotenv`, `elevenlabs`, `faster-whisper`) is already in `pyproject.toml`.

Frontend (`npm install`): `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `tailwindcss`, `postcss`, `autoprefixer`. Native `fetch` is sufficient — no `axios`.

## Explicitly out of scope

Auth/multi-tenancy, deployment/CI, automated test suites, OCR for scanned PDFs, retry queues for failed ingestion jobs — all deferred; this is a personal local-use app.

## Verification

- Phase 1: `uv run uvicorn backend.main:app --reload` boots, `backend/policies.db` is created, `GET /policies` returns `[]`.
- Phase 2: run the rewritten `rag/ingest.py` CLI against the 4 PDFs in `data/`; spot-check a table-heavy section (e.g. the sum-insured/cover-details page) in the resulting chunks to confirm structure survived; run `app.py` and ask a question that previously depended on table data (e.g. "what is my sum insured") to confirm retrieval quality didn't regress.
- Phase 3: run `extract_policy_summary` against one seed PDF's `full_text` in a scratch script, inspect the JSON for plausibility (correct policy number, dates, sum insured).
- Phase 4: `curl -F "file=@data/Health_Insurance.pdf" -F "policy_type=health" http://localhost:8000/policies/upload`, then poll `GET /policies/{id}` until `status == "ready"`, inspect `summary_json`.
- Phase 5: `curl -X POST http://localhost:8000/chat -d '{"message": "...", "history": [], "policy_id": null}'`; confirm `app.py`'s voice flow still plays audio after the `tts.py` bytes-return change.
- Phase 6: `npm run dev`, exercise the golden path in the browser — upload a PDF, watch it go processing → ready, view the summary, ask a question in chat, use the mic — per the project's UI-testing guidance in CLAUDE.md/general instructions.
