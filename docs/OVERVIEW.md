# DKIP — Plain-English Overview

*A guide for someone who has never seen this repo before. No jargon assumed.*

---

## 1. What is this project, in one paragraph?

The Indian Army's Corps of EME (the people who repair vehicles and equipment) has
thousands of pages of manuals, SOPs, inspection reports and scanned logs. Finding
one answer means flipping through PDFs for an hour.

**DKIP is a search-and-answer app for those documents.** You type a question in
normal English — *"what is the hydraulic pressure limit on the 5-tonne recovery
vehicle?"* — and it gives you an answer built **only from sentences it actually
found in your documents**, with a clickable link to the exact page it came from.

If your documents don't contain the answer, it says **"insufficient sources"**
instead of making something up. That refusal is the whole point of the product.

> Everything in this repo is a **demo (POC 1)** with **fake, made-up documents**.
> It is not a real accredited military system.

---

## 2. Why is it built the way it is?

Two hard requirements shaped every technical choice:

**(a) Never invent an answer.**
A wrong torque figure in a maintenance manual can kill someone. So the system is
built so the AI is *physically unable* to answer from its own memory — it is only
shown text pulled from your documents, and its output is checked afterwards to
confirm every claim points back to a real source. This pattern is called **RAG**
(Retrieval-Augmented Generation) and is explained in section 5.

**(b) It must eventually run with no internet at all.**
Real defense networks are *air-gapped* — no outside connection. But a demo needs
to look impressive today, which means using OpenAI. The solution: **all AI calls
go through one file** (`services/dkip/gateway/`). Swap a config value and the same
app talks to a local AI model running on your own hardware instead of OpenAI.
**Zero application code changes.** That one file is called the **model gateway**
and is the most important design decision in the repo.

---

## 3. What can a user actually do?

Seven screens (`apps/web/src/screens/`):

| Screen | What it does |
|---|---|
| **Ask** | Ask a question → get a cited answer. Click a citation → the source PDF opens at that page with the passage highlighted. |
| **Sources** | Browse all documents in the system. |
| **Summarize** | Summarize one document or one topic — still with citations. |
| **Reports** | Fill a template (e.g. "Inspection Digest") from the documents, then export to PDF or DOCX with a classification banner stamped on every page. |
| **Dashboards** | Charts of fleet readiness (how many vehicles are working) + ask questions about that table in English. |
| **Ingestion** *(admin only)* | Upload new documents, watch them get processed file by file. |
| **Audit** *(admin only)* | See every action anyone took, and prove the log hasn't been tampered with. |

### 3.1 How Reports actually work

1. **Pick a template** (`GET /report-templates`).
2. **Generate** (`POST /reports`). Each template field is filled one of two ways
   (`api/routers/reports.py:48-57`):
   - `type: "retrieval"` → calls `summarize_topic()` — **real RAG**, same retrieval
     and citation machinery as the Ask screen.
   - `type: "metric"` → calls `fleet_aggregates()` and formats a number.
3. **Edit** — the draft returns as editable text boxes with citation badges above
   each field (`Reports.tsx:87-105`). Saved via `PATCH /reports/{id}`.
4. **Export** — `POST /reports/{id}/export?format=pdf|docx`. ReportLab (PDF) or
   python-docx (DOCX), with the classification banner drawn on **every page**, top
   and bottom (`reports/export.py`).

That chain is complete and genuinely useful. What does **not** exist:

- **Only one template.** "Inspection Digest", hardcoded in `api/bootstrap.py:61-65`.
  The `report_templates` table has a `GET` route but **no POST/PATCH** — new
  templates require editing Python or inserting SQL. There is no template builder.
- **`metric` fields are hardcoded.** `reports.py:51` always emits
  `"Serviceable: X of Y total holdings."` regardless of the field's name. Metrics
  are not configurable.
- **Exports are never stored.** `Report.exported_object_key` (`models.py:198`) and
  the MinIO `exports` bucket both exist but nothing writes to either — the file
  streams to the browser and is gone. Dead, like `access_tags`.

### 3.2 How Dashboards actually work

Two independent halves:

**The charts — no AI involved.** Three hardcoded SQL queries
(`structured/engine.py:62-77`) produce totals, group-by-equipment and
group-by-unit. Recharts renders 4 KPI tiles and 2 bar charts. Fixed and reliable.

**The ask-in-English box — this is the AI part.** The gateway writes SQL from your
question, then it is caged (`engine.py:32-44`): `SELECT` only, whitelisted table
only, write keywords regex-blocked, `LIMIT 200` force-appended. The UI then shows
you **the generated SQL and the contributing rows** (`Dashboards.tsx:117-131`) — you
are never asked to trust a number you cannot check.

What does **not** exist: it is **one table**. `fleet_status`, 7 columns, declared as
a hardcoded Python dict (`engine.py:14-26`) and loaded from a single CSV by the seed
script. No way to register another table, and no dashboard builder.

### 3.3 Summary: what's supported vs. what needs building

| Capability | Status |
|---|---|
| Generate a cited report from the corpus | ✅ works |
| Edit a draft before export | ✅ works |
| PDF/DOCX export with classification marking | ✅ works |
| Fleet charts + KPIs | ✅ works (fixed layout) |
| Ask questions about the fleet table in English | ✅ works (SQL shown for verification) |
| Create a new report template | ❌ code change only |
| Configurable metrics in reports | ❌ one hardcoded string |
| Add a second structured data table | ❌ code change only |
| Build a custom dashboard | ❌ not a feature |

**The pattern:** the AI-and-citation half is real and reusable; the *authoring*
half was deliberately deferred. Nobody can create a template or dashboard without a
developer. Reasonable for a POC — it proves the hard part and skips the CRUD.

> ⚠️ **Known defect.** The Ingestion screen advertises `CSV/XLSX`
> (`Ingestion.tsx:50`) but `parse.py:140-143` has no handler for either — uploading
> a CSV fails with `unsupported file type: .csv`. The fleet CSV only loads because
> `scripts/seed.py:_load_fleet` reads it directly and INSERTs, bypassing ingestion
> entirely. Either fix the UI text or implement the parsers before a demo.

---

## 4. The services — what each one is and why it's here

When you run `docker compose up`, **eleven containers** start. Here's each one in
plain words. Think of it as a kitchen: each service is one appliance.

### 4.1 Postgres — *the filing cabinet*
**What it is:** the standard open-source SQL database.
**Why it's here:** it holds all the **facts and records** — the list of users, the
list of documents, who has what clearance level, every answer the AI ever gave,
and the audit log. It's the "source of truth."

Note what it does **not** hold: the actual PDF files, and the AI's math vectors.
Those live in MinIO and Qdrant respectively.

*Code:* `services/dkip/db/models.py` (all 14 tables are defined here)

### 4.2 MinIO — *the warehouse for files*
**What it is:** a self-hosted clone of Amazon S3. You give it a file, it gives you
back a key; later you hand back the key and get the file. It speaks exactly the
same API as S3, so moving to real S3 later requires no code change.

**Why it's here:** databases are bad at storing big binary files like PDFs. So the
PDF bytes go to MinIO, and Postgres just stores a short pointer (`object_key`)
like `raw/a3f9c2.../OM-VEH-001.pdf`.

It has three buckets (a bucket = a folder):
- `raw` — the original uploaded files
- `ocr` — images rendered from scanned pages
- `exports` — generated PDF/DOCX reports

**Where you see it:** when you click a citation and the source PDF opens, the API
fetched those bytes from MinIO. Web console: http://localhost:9001 (`dkip` /
`dkip-secret`).

*Code:* `services/dkip/stores/objects.py` — only 50 lines, that's the whole thing.

### 4.3 Keycloak — *the security desk that issues ID badges*
**What it is:** an open-source identity server. Instead of every app writing its
own login/password/roles code, Keycloak handles it centrally. It's the standard
choice for enterprise and government because it speaks **OIDC/SAML**, so it can
plug into an organization's existing Active Directory or smart-card login later.

**Why it's here:** real defense deployments won't accept an app with its own
private user table. They will demand "use our existing identity provider." Keycloak
is the seam that makes that possible.

**How login actually works here — this trips people up:**

There are **two** ways to sign in, and both are on purpose:

1. **Local login** (the guaranteed path). Username + password checked against the
   `users` table in Postgres, password hashed with PBKDF2. The API hands back a
   JWT it signed itself.
2. **Keycloak SSO** (the production path). You get bounced to Keycloak, sign in
   there, and come back holding a JWT that *Keycloak* signed.

The API accepts either (`services/dkip/core/security.py` → `decode_token`): it
first tries to verify the token with its own secret; if that fails, it fetches
Keycloak's public keys and tries again. **Result: if Keycloak is down or not
configured, the demo still works.** That's why local login exists.

A **JWT** ("JSON Web Token") is just a signed slip of paper the browser carries on
every request. It says: *who you are, your role (admin/user), and your clearance
level (1–4)*. Signed means the server can detect any edit.

The demo Keycloak setup lives in `deploy/compose/keycloak/realm-dkip.json` and is
imported automatically on boot: realm `dkip`, one client `dkip-web`, roles
`admin`/`user`, users `admin` (clearance 4) and `analyst` (clearance 2).

Console: http://localhost:8085 (`admin` / `admin`).

### 4.4 Qdrant — *find by meaning*
**What it is:** a **vector database**.

**The idea in plain words:** an AI model can turn any sentence into a long list of
numbers (a "vector" — here, 3072 numbers) that represents its *meaning*. Sentences
with similar meaning end up with similar numbers. Qdrant stores millions of these
lists and answers "which stored sentences are closest in meaning to this one?" in
milliseconds.

**Why it matters:** a user asking *"how do I stop the lifting arm leaking?"* will
match a manual paragraph titled *"hydraulic seal replacement"* — even though they
share almost no words. Plain keyword search would find nothing.

**One important detail:** the collection is named after which AI model created the
vectors — `corpus__openai-3l-3072`. Vectors made by one model are meaningless to
another. Naming them this way makes it impossible to accidentally search an
OpenAI-built index using a local model. If you swap the AI provider, you must
**re-index** (rebuild the vectors). Sections 6 and `docs/RUNNING.md §6` cover this.

*Code:* `services/dkip/stores/qdrant_store.py` · Dashboard: http://localhost:6333/dashboard

### 4.5 OpenSearch — *find by exact word*
**What it is:** a search engine (an open fork of Elasticsearch). It does classic
keyword search using an algorithm called **BM25**.

**Why both this AND Qdrant?** Because meaning-search is bad at exact strings.
Search for part number `HYD-4471-B` and a vector model shrugs — it has no *meaning*.
Keyword search nails it instantly. Conversely, keyword search fails on paraphrased
questions. **Each covers the other's blind spot.** Running both and merging results
is called **hybrid search**, and it's why answers here are noticeably better than a
naive RAG demo.

*Code:* `services/dkip/stores/opensearch_store.py` · http://localhost:9200

### 4.6 Redis — *the mailbox between the API and the worker*
**What it is:** a very fast in-memory data store. Here it is used for exactly one
job: carrying messages from the `api` container to the `worker` container.

**Why it's required — the core reason:** `api` and `worker` are two **separate
running processes**, possibly on two different machines. They cannot share a Python
variable. They need somewhere *outside both of them* to pass messages. Redis is
that shared noticeboard.

**What that looks like in practice.** When you upload files, the API does *not*
process them. It writes a note to Redis and returns immediately:

```python
# services/dkip/api/routers/documents.py:45
celery_app.send_task("dkip.ingest.process_file", args=[row.id, incoming_key, ...])
return {"job_id": job.id, "status": "accepted"}   # HTTP 202, instantly
```

The `worker` container is watching Redis, sees the note, and does the slow part —
OCR, chunking, embedding, indexing.

**What breaks if you do the work inline instead:**

| Problem | Why |
|---|---|
| Upload times out | Browsers/nginx give up after ~30–60s. OCR on a 200-page scan takes minutes. |
| Q&A freezes during uploads | The API has limited request slots. 50 files processed inline occupy them for ten minutes, and everyone asking questions hangs. |
| Memory blowout | The worker is capped at `--concurrency=2` — two files at a time, ever. Inline, 50 uploads render and embed simultaneously and the container dies. |
| A crash loses files | `task_acks_late=True` (`worker.py:9`) means a task is acknowledged only after it *finishes*. Worker dies on file 30 → Redis redelivers it. Inline, that file is gone with no record. |

**Could you skip Redis?** Technically yes — the `ingestion_files` table already has
a `pending` status, so a worker could poll Postgres. But then you hand-write the
queue: polling loop, row locking so two workers don't grab the same file, retry
counts, stuck-job timeouts. Celery + Redis gives all of that in three lines
(`worker.py:8-10`). That's the real justification — not that Postgres *couldn't*,
but that this costs nearly nothing.

> **Note:** query rate limiting (30/min) does **not** use Redis — it's an
> in-process dictionary in `api/routers/query.py:25`, with a comment noting it
> should move to Redis if the API ever runs more than one replica. Today it does
> not, so per-process counting is correct.

### 4.7 Celery worker — *the back-room staff*
**What it is:** the standard Python background-job system. It's not a separate
image — it's the **same API container** started with a different command
(`celery -A worker worker`), so the code is identical, just running as a consumer
of the Redis queue instead of an HTTP server.

**Why it's here:** it does the slow work — one Celery task per uploaded file, each
with its own success/failure status. If file 3 of 50 is corrupt, files 1–2 and 4–50
still succeed and the ledger records exactly what failed and why.

*Code:* `services/dkip/ingest/tasks.py`

### 4.8 Reranker — *the second-opinion judge*
**What it is:** a small FastAPI service wrapping a **cross-encoder** model
(`ms-marco-MiniLM-L-6-v2`, ~90 MB).

**What's a cross-encoder, simply?** Qdrant and OpenSearch are *fast but rough* —
they score your question and each passage separately and compare the scores. A
cross-encoder is *slow but sharp* — it reads the question and one passage
**together** and judges "does this passage actually answer this question?" Too slow
for thousands of passages, perfect for the ~40 finalists.

**Why it's a separate service:** it needs PyTorch, which is huge. Keeping it out of
the main API container keeps the API small and lets the reranker scale on its own.
Crucially, reranking is **always local, never cloud** — so ranking behaviour is
identical whether you're on OpenAI or air-gapped.

It also does **double duty as the honesty gate**: if the best passage scores below
`0.15`, the system decides your corpus simply doesn't contain the answer and
abstains before the AI is even asked. That single number is the main
hallucination defence.

If the model can't download, it falls back to crude word-overlap scoring so the
stack still boots. Check which mode you're in at `/health`.

*Code:* `services/reranker/app.py`

### 4.9 API — *the brain*
FastAPI (Python). Every business rule lives here: authentication, permissions,
the RAG pipeline, summaries, reports, audit logging. The frontend has no direct
access to any database — it only ever talks to this.

Interactive API docs: http://localhost:8002/docs

*Code:* `services/dkip/api/routers/` — one file per feature area.

### 4.10 Web — *the face*
React + TypeScript + Tailwind, built with Vite, served by nginx. nginx also
forwards `/api/*` calls to the API container, which sidesteps browser CORS issues.

Deliberately styled like a military command console: dark gunmetal-navy, one teal
accent colour, technical fonts, classification banners top and bottom.

http://localhost:8080

### 4.11 Seed — *the setup crew*
Runs once at startup, then exits. It generates the fictional documents, loads the
fleet-status table, and pushes everything through ingestion so the demo has content
the moment you log in. Safe to re-run — content-hash dedupe means unchanged files
are skipped.

*Code:* `services/dkip/scripts/seed.py`

---

## 5. The two journeys that explain everything

### Journey A: A document goes in

```
Upload PDF
   │
   ├─ 1. SHA-256 hash it. Seen this hash before? Stop — already ingested.
   ├─ 2. Store raw bytes in MinIO           → get object_key
   ├─ 3. Parse it (PyMuPDF) → text blocks, each tagged with page + position
   │       └─ Almost no text found? It's a scan → run OCR (Tesseract) first
   ├─ 4. Chunk it: ~600-token pieces, 12% overlap, split on section boundaries
   │       (overlap exists so a sentence spanning a boundary isn't lost)
   ├─ 5. Ask the gateway to embed each chunk → a vector per chunk
   ├─ 6. Write chunk text + page anchors to Postgres
   ├─ 7. Write vectors to Qdrant
   └─ 8. Write text to OpenSearch
```

Every chunk carries `clearance_required` and section/page anchors. Those two facts
are what make security (section 7) and citations (below) work.

*Code:* `services/dkip/ingest/pipeline.py`

### Journey B: A question comes out

```
"What's the hydraulic pressure limit on the 5-tonne recovery vehicle?"
   │
 1. REWRITE     — if this is a follow-up, fold in prior turns so pronouns
                  like "it" resolve. Skipped on the first question.
 2. RETRIEVE    — ask Qdrant (meaning) AND OpenSearch (keywords) in parallel,
                  50 results each. Both filter by YOUR clearance level.
 3. FUSE (RRF)  — merge the two lists. Cosine scores and BM25 scores aren't
                  comparable, so RRF ignores scores and uses only *positions*:
                  a chunk ranked #1 by both wins. Keep top 40.
 4. RERANK      — cross-encoder re-scores those 40 properly. Keep top 6.
 5. ABSTAIN GATE— best score below 0.15? STOP. Return "insufficient sources."
                  The AI is never called.
 6. SYNTHESIZE  — send those 6 passages to the AI as [S1]..[S6], with strict
                  instructions: answer ONLY from these, cite every claim,
                  or output the word INSUFFICIENT_SOURCES.
 7. GUARDRAIL   — check the answer ourselves:
                  · Did it emit any [Sn] markers at all? No → abstain.
                  · Do those markers point at real passages? Fakes dropped.
                  · Confidence = 0.6 × rerank score + 0.4 × citation coverage.
 8. CITE        — turn [S3] into a clickable link: document, section, page,
                  and the exact chunk id.
 9. RECORD      — save the answer AND the exact chunk ids used, so months
                  later an auditor can re-verify what the AI actually saw.
```

Notice there are **three** independent places the system can refuse: no candidates
found, rerank score too low, or no valid citations in the output. That layering is
deliberate.

*Code:* `services/dkip/rag/pipeline.py` (orchestration) and `rag/cite.py` (guardrail)

---

## 6. The model gateway — the single most important file

Every AI operation in this app is one of exactly three things:

- `generate(prompt)` → text
- `embed(texts)` → vectors
- `rerank(query, passages)` → scores

`services/dkip/gateway/base.py` defines those three as an interface. **No other
file in the repo imports `openai`.** Three implementations exist:

| Provider | Generate | Embed | Rerank | Used for |
|---|---|---|---|---|
| `cloud` | OpenAI GPT | OpenAI embeddings | local reranker | the demo |
| `local` | vLLM/Ollama on your hardware | BGE on your hardware | local reranker | air-gapped production |
| `fake` | deterministic extraction, no network | hashed word vectors | local reranker | tests, offline, no API key |

Switching is one environment variable: `MODEL_PROVIDER`.

Two details worth knowing:
- **`fake` is not a stub.** It genuinely extracts sentences from the retrieved
  passages, emits real `[Sn]` citations, and returns `INSUFFICIENT_SOURCES` when
  evidence is thin. So the entire grounding/citation/abstention story is
  demonstrable with **no API key and no internet**. Set `MODEL_PROVIDER=fake`.
- **Missing API key auto-degrades to `fake`** rather than crashing — and says so
  at `/health`, so it's never silent.

---

## 7. Security — the parts that are actually interesting

**Clearance filtering happens *inside* the database query, not after it.**
Both Qdrant and OpenSearch are given `clearance_required <= your_level` as a filter
*before* they search. A document above your clearance is not fetched-then-hidden —
it never enters the result set, so it can never leak into an AI prompt. Levels:
1 UNCLASSIFIED, 2 RESTRICTED, 3 CONFIDENTIAL, 4 SECRET.

#### Who assigns the classification, and where?

**A human admin, by hand, at upload time. Nothing is automatic.**

| | Where | Code |
|---|---|---|
| **Documents** | A dropdown on the Ingestion screen, chosen by the admin uploading the files. Admin-only route. | `apps/web/src/screens/Ingestion.tsx:80` → `api/routers/documents.py:24` |
| **Demo corpus** | Hardcoded per file in the seed manifest — one file is deliberately RESTRICTED so the filtering is demonstrable. | `scripts/corpus.py:81-83` |
| **Users** | An admin sets `clearance` when creating the user (default 1), or it's seeded. | `api/routers/admin.py:23`, `api/bootstrap.py:26-30` |
| **Keycloak users** | A `clearance` attribute on the Keycloak user; falls back to 1 if missing. | `core/security.py:77` |

The word becomes a number once, at ingestion (`ingest/pipeline.py:46-47`), and is
then stamped onto **every chunk** in both Qdrant and OpenSearch. That copy on the
chunk is what lets the search filter run without consulting Postgres.

**POC limitations to be aware of** — all fine for a demo, all things a real
deployment would have to close:

- **The default is the *least* restrictive.** `Form("UNCLASSIFIED")` means an
  omitted field yields a world-readable document. A production system should fail
  *closed* (default to the highest level), not open.
- **No re-classification path exists.** There is no `PATCH /documents/{id}` — only
  DELETE. A mis-classified document can only be deleted and re-uploaded. No review
  workflow, no downgrade authority, no audit trail of classification changes.
- **Nothing validates the human's choice.** A document marked SECRET on every page
  sits at clearance 1 if the uploader left the dropdown alone. The uploader is
  trusted absolutely.
- **The UI exposes only 2 of the 4 levels** (UNCLASSIFIED, RESTRICTED). CONFIDENTIAL
  and SECRET exist in the backend map but cannot be selected.
- **`access_tags` is dead.** The field is written at ingestion (`models.py:68`) but
  read by no filter anywhere — compartment / need-to-know tagging is modelled but
  not enforced. Only the numeric clearance level actually gates access.

**The audit log is hash-chained.** Each entry stores
`hash = SHA256(previous_hash + this_event)` — the same idea as a blockchain. Edit or
delete any past row and every hash after it stops matching. `GET /audit/verify`
walks the whole chain and reports the exact row where it breaks. You can't rewrite
history without it showing.

**Answers are re-verifiable.** Each answer stores the exact chunk ids it used, so
`GET /answers/{id}/verify` can confirm months later that those sources still exist
and still say the same thing.

**Text-to-SQL is caged.** The Dashboards screen lets you ask questions in English
that become SQL. That's dangerous, so: only `SELECT` is allowed, only the
whitelisted `fleet_status` table can be touched, write keywords are regex-blocked,
and a `LIMIT 200` is force-appended.

**Superseded documents are demoted, not deleted.** Revision A of a manual stays
searchable but is pushed to the bottom of the ranking and flagged in the UI — so
you can still audit what an old procedure said without accidentally following it.

---

## 8. Where to find things

```
apps/web/          React frontend — screens/ is the fastest way in
apps/api/          FastAPI entry point (thin)
services/dkip/
  gateway/         ⭐ the AI seam — read base.py first
  rag/             ⭐ question → cited answer (pipeline.py, cite.py)
  ingest/          document → searchable chunks (parse, ocr, chunk, pipeline)
  stores/          thin wrappers: qdrant, opensearch, minio
  db/models.py     every table in the system
  core/            config, auth, audit, dependencies
  api/routers/     one file per feature area
  structured/      caged text-to-SQL for the dashboards
  reports/         PDF/DOCX export with classification banners
services/reranker/ the cross-encoder service
deploy/compose/    docker-compose + Keycloak realm
data/corpus/       the fake documents
eval/run.py        scores the system against known-good Q&A pairs
```

---

## 9. Running it

```bash
cd deploy/compose
cp .env.example .env     # add OPENAI_API_KEY, or set MODEL_PROVIDER=fake
docker compose up -d --build
```

Wait for the `seed` container to finish (`docker compose logs -f seed`), then open
**http://localhost:8080** and log in as `analyst` / `analyst123`.

Needs ~8 GB of RAM given to Docker — OpenSearch, Qdrant, Keycloak and PyTorch are
all memory-hungry.

Full details and troubleshooting: **`docs/RUNNING.md`**.

**Sanity check without the stack:**
```bash
cd services && python -m tests.test_rag_core
```

---

## 10. Glossary

| Term | Plain meaning |
|---|---|
| **RAG** | Search your documents first, then let the AI write an answer using only what was found. |
| **Embedding / vector** | A list of numbers representing a sentence's meaning. Similar meaning → similar numbers. |
| **Chunk** | One ~600-token piece of a document. The unit that gets searched and cited. |
| **BM25** | The classic keyword-relevance formula. Good at exact terms, blind to paraphrase. |
| **Hybrid search** | Running meaning-search and keyword-search together and merging. |
| **RRF** | Reciprocal Rank Fusion — merges two result lists using positions, not scores, since the scores aren't comparable. |
| **Cross-encoder** | A model that reads question + passage together to judge relevance. Slow, accurate, used on finalists only. |
| **Grounded** | Every claim traces back to a real retrieved passage. |
| **Abstain** | Refusing to answer because the evidence isn't there. A feature, not a bug. |
| **Air-gapped** | A network with no connection to the outside world. |
| **JWT** | A signed slip of paper the browser carries proving who you are. |
| **OIDC** | The standard protocol for "log in with an identity provider" — what Keycloak speaks. |
| **Clearance level** | 1–4. You only ever see documents at or below your level. |
| **Superseded** | An older revision. Still searchable, ranked last, flagged in the UI. |
