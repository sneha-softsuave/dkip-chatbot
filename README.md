# DKIP — Defense Knowledge Intelligence Platform (POC 1)

AI knowledge assistant for defense documentation — **grounded, cited** natural-language Q&A over an internal corpus, with summarization, templated reports, and dashboards. Every AI call goes through **one model gateway**, so the demo runs on OpenAI while production can run fully local and air-gapped with **zero application-code change**.

> All demonstration data is **entirely fictional** (Indian-Army / Corps of EME styling). This is a demonstration platform and reusable foundation, not an accredited system. `UNCLASSIFIED // FOR DEMONSTRATION`.

## What it does

- **Ask** a plain-language question → an answer composed **only** from retrieved source passages, with inline citations; the system **abstains** ("insufficient sources") when the corpus can't support an answer.
- **Open a citation** → the source PDF opens at the exact page with the cited passage highlighted.
- **Summarize** a document or a topic, cited. **Generate** a report and export to PDF/DOCX with classification marking. **View** fleet dashboards + ask structured questions.
- **RBAC + clearance** enforced *inside retrieval*; **immutable hash-chained audit** of every action, with per-answer source re-verification.

## Architecture

```
React/TS SPA ──▶ FastAPI (async) ──▶ RAG core: hybrid retrieve (Qdrant ∥ OpenSearch)
   │                │                 → RRF fusion → local cross-encoder rerank
   │                │                 → grounded synthesis (gateway) → guardrail/abstain → cite
   │                ├──▶ Celery workers: parse → OCR → chunk → embed → index
   │                └──▶ Model Gateway (one interface): generate · embed · rerank
   │                        provider = CONFIG:  cloud (OpenAI) | local (vLLM+BGE) | fake (offline)
   └── Keycloak OIDC + local JWT · Postgres · MinIO · Redis
```

The **model gateway** (`services/dkip/gateway/`) is the only place the app talks to AI models — the air-gap seam. See `docs/` and the [Implementation Plan](docs/POC1-Defense-Knowledge-Intelligence-Platform-Implementation-Plan.docx).

## Quick start

```bash
cd deploy/compose
cp .env.example .env          # set OPENAI_API_KEY, or MODEL_PROVIDER=fake for offline
docker compose up -d --build  # brings the whole stack up; `seed` ingests the corpus
```
Open **http://localhost:8080**, sign in as `analyst` / `analyst123`.

New here? Start with **[docs/OVERVIEW.md](docs/OVERVIEW.md)** — plain-English tour of the project and every service.

Full instructions: **[docs/RUNNING.md](docs/RUNNING.md)** · Test plan: **[docs/TESTING.md](docs/TESTING.md)** · FR map: **[docs/traceability.md](docs/traceability.md)**.

## Repository layout

```
apps/web            React/TS SPA (Vite, Tailwind) — the command-console UI
apps/api            FastAPI entrypoint
services/dkip       gateway · rag · ingest · structured · reports · db · core · api routers
services/reranker   local cross-encoder service
eval/               offline golden-set harness
deploy/compose      docker-compose + Keycloak realm + seed
data/               fictional corpus + golden Q&A
docs/               PRD, Implementation Plan, RUNNING, TESTING, traceability
```

## Design

Defense command-console aesthetic: deep gunmetal-navy graphite, a single phosphor **signal-teal** accent for AI/interactive elements, status colours reserved for meaning (grounded / superseded / abstain), technical type (Rajdhani + IBM Plex Sans/Mono), an instrument-frame chrome (corner reticles, classification banners, monospace metadata stamps), and a citation ↔ ranked-evidence ↔ GROUNDED-stamp system that makes trust legible.

## Verify it works

```bash
cd services && python -m tests.test_rag_core          # grounding guardrail + fusion self-check (no stack)
DKIP_API=http://localhost:8000/api/v1 python eval/run.py   # golden-set metrics (stack up)
```
