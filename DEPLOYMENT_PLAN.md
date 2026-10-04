-

# Storage rework, Docker, and CI/CD for Cloud Run

## Context

Phase 1 (done and committed) made the backend light enough for scale-to-zero hosting: local `bge-small` embeddings (fastembed/ONNX), the Jina reranker API, Docling as a separate ingestion job, rate limiting with model rotation, and local Kokoro TTS. Nothing is deployed, and **everything still lives on local disk**:

| Thing               | Today                                                                           | Why it can't go to Cloud Run as-is                                                       |
| ------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| App database        | SQLite`backend/policies.db` (`config.py:DATABASE_URL`, `db.py`)           | Cloud Run's disk is wiped on every instance restart                                      |
| Vector store        | Chroma in`vectordb/` (34 MB) via `rag/vectorstore.py`, `rag/retriever.py` | Same, and a local Chroma client can't be shared by the web service and the ingestion job |
| Keyword search      | In-memory BM25 rebuilt from Chroma (`retriever.py:_load_corpus`)              | Per-instance cache that can't be invalidated across instances                            |
| Rate-limit counters | SQLite`backend/rate_limits.db` (`core/rate_limiter.py`)                     | Each instance would count separately and exceed the real quota                           |
| Uploaded PDFs       | `backend/uploads/<policy_id>/` (`routers/policies.py`)                      | The ingestion Job runs in a different container and can't see the web container's disk   |
| Docker / CI         | none                                                                            | n/a                                                                                      |

**Goal:** move all state to managed free-tier services, then containerize, then automate deploys. The app runs from Cloud Run with no local state. Free API keys stay (decided earlier); the cost controls are in Phase G.

**Target architecture**

```
Vercel (React) ──> Cloud Run service "web" (FastAPI, Whisper, Kokoro, fastembed) ──> Neon Postgres + pgvector
                          │                                                          (app tables, chunks, api_calls)
                          ├── GCS bucket (policy PDFs)
                          └── triggers ──> Cloud Run Job "ingest" (Docling) ──> same Neon DB + GCS
Gemini / Jina APIs (free keys)
```

**Why storage first, then Docker, then CI/CD:** Docker images built before the storage move would still contain SQLite and Chroma on a disk Cloud Run wipes, so they'd be rebuilt after. Every storage phase can be developed and tested on the laptop with `uv run`.

**Decisions made here**

- The vector store is **a `chunks` table in Neon with pgvector**, not a separate service and not on GCP. Neon's free tier (0.5 GB) holds our corpus many times over.
- Embedding dimension stays **384** (bge-small). The old plan's 768 was for Gemini embeddings, which we dropped.
- Retrieval keeps the same pipeline shape (dense + keyword, fused with reciprocal rank fusion, then Jina rerank). Only the stores underneath change, and `retriever.retrieve(query, metadata_filter)` keeps its signature, so `core/insurance_bot.py` and the chat services don't change.

## Phase A: Neon Postgres for the app database

1. **Neon project:** create it in the region closest to the Cloud Run region (see open decisions). Use the **pooled** connection string for the web service and the direct one for migrations and the ingest job. Neon autosuspends after 5 idle minutes and takes ~0.5–1s to wake, so first requests after idle are slower.
2. **Dependencies:** add `psycopg[binary]` and `alembic`. Remove nothing yet.
3. **`backend/config.py`:** `DATABASE_URL = os.environ["DATABASE_URL"]` for deployed environments, falling back to the SQLite path when unset so a laptop still works offline. Add `ENV` (`dev`/`prod`); in `prod`, refuse to start if `SECRET_KEY` is still the dev default.
4. **`backend/db.py`:** drop the SQLite-only `check_same_thread` arg; add `pool_pre_ping=True` and a small pool (`pool_size=5`, `pool_recycle=300`) so connections that Neon suspended get replaced.
5. **Alembic replaces `sync_columns()`:** baseline migration generated from the current models (`User`, `Policy`, `ChatSession`, `ChatMessage`), `main.py:lifespan` stops calling `create_all`/`sync_columns`, and migrations run explicitly (`alembic upgrade head`) locally, and in CI/CD as a step before deploy (Phase G).
6. **Postgres behaviour to check:** `JSON` columns (`summary_json`, `sources`, `meta`) are fine; `DateTime(timezone=True)` is fine; `String` columns are `VARCHAR` without length, which Postgres accepts.
7. **Existing local data** (users, 13 policies, chat sessions): start fresh in Neon and re-upload policies, unless the user wants a copy script (open decision). Fresh is recommended: ingestion takes minutes and the old rows have `user_id = NULL` cases anyway.

## Phase B: pgvector chunk store (replaces Chroma and BM25)

**New table `chunks`** (migration adds `CREATE EXTENSION IF NOT EXISTS vector`):

| Column                                                  | Notes                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                  | bigserial PK                                                                                                                     |
| `policy_id`                                           | FK to`policies.id`, `ON DELETE CASCADE` (replaces `vectordb.delete(where=policy_id)` in `routers/policies.py:142`)       |
| `user_id`                                             | copied from the policy; see "security note" below                                                                                |
| `policy_type`                                         | nullable; replaces Chroma metadata, updated by SQL`UPDATE` instead of `_collection.update` (`routers/policies.py:118-128`) |
| `source_file`, `page`, `section`, `chunk_index` | the metadata that citations and`PolicyViewerDialog` use today                                                                  |
| `content`                                             | the chunk text                                                                                                                   |
| `embedding`                                           | `vector(384)`, with an HNSW index using `vector_cosine_ops`                                                                  |
| `tsv`                                                 | generated`tsvector` from `content` (`english`), with a GIN index                                                           |

**Code changes**

- `backend/rag/vectorstore.py`: keep `LocalEmbeddings` and `get_embeddings()` (fastembed, reused as-is). Replace `get_vectordb()` and the Chroma collection with a small `chunk_store` module (SQLAlchemy models via the `pgvector` package's `Vector` type, plus `add_chunks(policy_id, user_id, docs)`, `replace_policy_chunks(...)`, `set_policy_type(policy_id, type)`). Remove `COLLECTION_NAME` / `PERSIST_DIRECTORY`.
- `backend/rag/retriever.py`: replace `get_hybrid_retriever`, `_load_corpus`, `invalidate_bm25_cache` with two SQL queries and a fusion step:
  - Dense: `ORDER BY embedding <=> :query_vec LIMIT DENSE_FETCH_K` with the same filter rules as today (`policy_id`, else `policy_type`, else none).
  - Sparse: `ts_rank_cd(tsv, query)` over a tsquery built by OR-ing the question's terms. `plainto_tsquery` ANDs terms and would return nothing for natural-language questions.
  - Fusion: reciprocal rank fusion in Python with the existing 0.5/0.5 weights, equivalent to what `langchain_classic.EnsembleRetriever` does now. This drops the `EnsembleRetriever`, `BM25Retriever` and MMR code. **Behaviour change:** MMR diversity goes away; the Jina rerank covers most of it. Verified with the eval set, below.
  - `rerank()` and `retrieve()` stay unchanged apart from the retrieval call. Returned `Document`s keep the same `metadata` keys, so `insurance_bot.py` context assembly and source citations are untouched.
- `backend/rag/ingest_job.py:persist`: one transaction that inserts the new chunks, deletes the old ones for that policy, and updates the `Policy` row. This is better than the Chroma add-then-delete, since a failure rolls everything back.
- `backend/services/ingestion.py`, `routers/policies.py`: delete `invalidate_bm25_cache()` calls.
- `backend/rag/ingest.py`: `--reindex-all` no longer drops a collection; it deletes chunks per policy as part of `persist`. The `--reembed-from` Chroma path is removed.
- `pyproject.toml`: remove `chromadb`, `langchain-chroma`, `rank-bm25`; add `pgvector`.

**Security note to fix while here:** today an unscoped chat that resolves to a `policy_type` filters by type only, so retrieval can in principle return chunks from **other users'** policies of that type. With `user_id` on `chunks`, every query adds `WHERE user_id = :current_user`. This needs `user_id` passed from `chat_service` into `ask_insurance_bot` and `retrieve`; check how the call chain carries it.

**Eval gate:** run `uv run python -m evals.run_eval --answers` on the current Chroma setup first and save the numbers (hit@k, answer match, p50/p95). Re-run after Phase B. Hit@k should be no worse than the baseline; if it drops, tune `DENSE_FETCH_K`, the tsquery construction and fusion weights before moving on.

## Phase C: rate limiter on Postgres

- `backend/core/rate_limiter.py`: swap `sqlite3` for SQLAlchemy `text()` queries against the same engine; keep the `api_calls` table and all window/limit logic as it is.
- `BEGIN IMMEDIATE` has no Postgres equivalent. Use `pg_advisory_xact_lock(hashtext(resource))` at the start of the transaction, which serializes check-and-record per resource across instances.
- Table creation moves into an Alembic migration; remove `RATE_LIMIT_DB_PATH` and `_schema_ready_for`.
- `usage_snapshot()` and `python -m backend.core.rate_limiter` keep working.
- Neon wake-up latency applies here too (each LLM call checks the counters). Acceptable, since the DB is already awake by then from the request's other queries.

## Phase D: PDFs in GCS

- New `backend/storage.py` with one interface (`put(key, fileobj)`, `open(key)`/`download_to(key, path)`, `delete_prefix(prefix)`, `exists(key)`) and two backends chosen by `GCS_BUCKET`: local directory (current behaviour, for laptops) and GCS via `google-cloud-storage`.
- `Policy.file_path` becomes an object key like `policies/<id>/<filename>` (new rows only, since the DB starts fresh).
- Call sites: `routers/policies.py` upload (write), `GET /policies/{id}/file` (stream the blob through the API, still behind the bearer token), delete (remove the prefix); `ingest_job.process` downloads the PDF to a temp file before `parse_and_chunk`; `ingest.py` and `evals/run_eval.py` read it through `storage`.
- Bucket: private, uniform access, same region as Cloud Run. The Cloud Run service account gets `storage.objectAdmin` on this bucket only.

## Phase E: simplify ingestion, add Cloud Run Job mode

- With Postgres, the web process no longer has to be the only writer, so the `--out` JSON handoff in `services/ingestion.py` and `ingest_job.py` goes away. `ingest_job --policy-id N` runs the whole job (parse, extract, persist), as the plan intended.
- `INGESTION_MODE=local` (dev): the web process still runs it as a **subprocess**, because Docling's native crash on a second PDF in one process is the reason that isolation exists. It just stops post-processing the JSON.
- `INGESTION_MODE=cloudrun` (prod): `run_ingestion_job` calls the `google-cloud-run` client's `run_job` with an args override `--policy-id N` and returns immediately.
- **Stuck-row reconciler:** in `lifespan`, mark any policy that's been `processing` for over 30 minutes as `failed` with an explanatory `error_message`. This fixes the known issue where a restart leaves a row stuck forever.

## Phase F: Docker

Two images from one repo, using `uv` (`uv sync --frozen`), multi-stage, non-root user, `PORT` env.

**`Dockerfile.web`** (target well under 1.5 GB):

- `python:3.13-slim`, `uv sync --frozen --no-dev` (main dependencies only; no torch, no Docling).
- Bake models at build time so cold starts never download: fastembed `bge-small` (`FASTEMBED_CACHE_PATH`), Kokoro int8 model and voices (`KOKORO_MODEL_DIR`, ~120 MB, via the existing `_download()` in `voice/tts.py`), faster-whisper `base` (`HF_HOME`).
- Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.

**`Dockerfile.ingest`:**

- Same base plus `uv sync --frozen --group ingest`, with CPU-only torch wheels (the PyTorch CPU index) so the image doesn't carry ~2 GB of CUDA libraries.
- Bake the Docling models (layout, TableFormer, OCR) so the job doesn't download them on every run.
- Entry point: `python -m backend.rag.ingest_job`.

**`.dockerignore`:** `.venv`, `.git`, `vectordb/`, `backend/uploads/`, `.cache/`, `*.db`, `.env`, `frontend/node_modules`, `data/`, `images/`, `__pycache__`.

**Local check:** `docker compose` file for dev (web + env file pointing at a Neon dev branch and a local-storage volume), mainly to check the images start and answer a chat and a voice turn before touching GCP.

## Phase G: GCP setup, Cloud Run, and CI/CD

**One-time GCP setup**

- Project and billing account (needed to stay on the always-free tiers after the trial), Artifact Registry repo (cleanup policy: keep the last 3 images), GCS bucket, Secret Manager secrets (`SECRET_KEY`, `JINA_API_KEY`, `DATABASE_URL`), runtime service account with least privilege (`roles/aiplatform.user` for Gemini on Vertex, bucket access, secret access, `run.jobs.run` for triggering the ingest job).
- **Cost controls:** budget alert (for example 80% of a small monthly cap), `max-instances` on the service (2–3) and the job, and keep the job timeout at 30 minutes so a hung ingestion can't run up CPU time.

**Cloud Run service `web`**

- 1 vCPU, **2 GiB** (Kokoro ~0.3 GB + Whisper ~0.3 GB + fastembed + Python, with headroom), min instances 0, CPU boost on for cold starts, concurrency ~4 (TTS is serialized by `_synth_lock` and Whisper is CPU-bound, so higher concurrency just queues), request timeout 300s, secrets mounted from Secret Manager, env: `ENV=prod`, `INGESTION_MODE=cloudrun`, `GCS_BUCKET`, `CORS_ORIGINS`.
- Cold start budget: model loads in `lifespan` (Kokoro ~0.5s, Whisper, fastembed) plus Neon wake-up. Measure it; if over ~10s, consider min-instances=1 later (costs idle CPU).

**Cloud Run Job `ingest`:** 4 vCPU, 8 GiB, 30-minute timeout, max retries 0 (the row is marked `failed` and the user can retry from the UI), same secrets.

**Migrations:** a Cloud Run Job `migrate` that runs `alembic upgrade head` from the web image, executed before each deploy.

**CI/CD (GitHub Actions, assuming the repo is on GitHub)**

- **Auth:** Workload Identity Federation, no long-lived JSON key in GitHub secrets.
- **On pull request (checks only):** backend `python -c "import backend.main"` in a clean web-only environment (confirms no torch/Docling import), frontend `npx tsc -b`, `npx oxlint src`, `npm run build`, and a Docker build of both images without pushing.
- **On push to `main` (deploy):** build and push both images (tag = commit SHA, layer cache via the registry), run the `migrate` job, `gcloud run deploy web`, `gcloud run jobs update ingest`. Path filters so frontend-only changes don't rebuild the images.
- **Rollback:** deploy a previous SHA with `gcloud run deploy --image ...:<sha>`; migrations are written to be backward compatible with the previous release.
- The eval set isn't a CI gate yet, because it needs live Gemini/Jina quota; run it manually before merging retrieval changes.

## Phase H: frontend on Vercel and smoke test

- Vercel project from `frontend/`, `VITE_API_BASE_URL` = the Cloud Run URL (custom domain later).
- `backend/config.py`: replace the hardcoded `VITE_DEV_ORIGIN` with a `CORS_ORIGINS` env list including the Vercel domain.
- Smoke test on the live stack: sign up, upload a policy (job runs, row reaches `ready`), scoped and unscoped chat, a source chip opens the right PDF page, voice turn plays through the stream with the first audio in a few seconds, then idle 15+ minutes and confirm the cold-start path still works.

## Critical files

- Modify: `backend/config.py`, `backend/db.py`, `backend/main.py`, `backend/rag/vectorstore.py`, `backend/rag/retriever.py`, `backend/rag/ingest_job.py`, `backend/rag/ingest.py`, `backend/services/ingestion.py`, `backend/routers/policies.py`, `backend/core/rate_limiter.py`, `backend/services/chat_service.py` + `backend/core/insurance_bot.py` (pass `user_id` into retrieval), `evals/run_eval.py`, `pyproject.toml`, `CLAUDE.md` (Architecture, Ingestion, Known issues)
- New: `backend/storage.py`, `alembic/` + `alembic.ini`, `Dockerfile.web`, `Dockerfile.ingest`, `.dockerignore`, `docker-compose.yml`, `.github/workflows/ci.yml` and `deploy.yml`
- Reuse as-is: `LocalEmbeddings`, `retriever.rerank()` and `retrieve()` signature, `core/llm.py`, the chains, `voice/tts.py:_download` (for baking the Kokoro files), the frontend

## Open decisions (recommended defaults in bold)

1. Existing local data: **start fresh and re-upload** vs. write a one-off SQLite-to-Postgres copy script.
2. Region: **pick the Cloud Run region first, then the nearest Neon region** (cross-region DB latency is paid on every query). Needs the user's preferred region and whether the GCP project already exists.
3. Repo host and CI: **GitHub Actions with Workload Identity Federation**, vs. Cloud Build triggers.
4. Drop MMR in favour of plain top-k plus rerank: **yes, if the eval hit@k holds** (checked in Phase B).
5. Per-user daily usage cap (suggested earlier, not approved): **add after deploy**, once real usage shows what's reasonable.

## Verification

- **A:** `alembic upgrade head` on a fresh Neon branch creates the tables; backend boots against it (`uv run uvicorn backend.main:app`), signup/login and policy CRUD work.
- **B:** eval before (Chroma) and after (pgvector) with the same questions: hit@k and answer-match no worse, p95 retrieval+rerank still comfortably under the LLM time. Confirm a second user's chat can never retrieve the first user's chunks. Confirm delete cascades chunks and `PATCH /policies/{id}` re-tags them.
- **C:** two processes hammering `acquire()` stay within limits; `python -m backend.core.rate_limiter` shows the counts.
- **D:** upload, view, and delete work against a real GCS bucket; the ingest job reads the PDF from it.
- **E:** local mode ingests via subprocess with no JSON handoff; kill the server mid-job and confirm the reconciler marks the row `failed` on restart; run the job once through `INGESTION_MODE=cloudrun`.
- **F:** `docker build` both images; check sizes (web well under ~1.5 GB); run the web container with no network access to Hugging Face and confirm it starts (models baked in); `import torch` fails in the web image and succeeds in the ingest image.
- **G:** open a PR and see the checks pass; merge and watch the deploy succeed end to end; trigger a rollback to the previous SHA; check the budget alert exists.
- **H:** the smoke test above.
