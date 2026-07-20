# DKIP — FR Traceability Matrix

Maps every PRD functional requirement (FR-5.x.y) to the component/endpoint that implements it and the test that verifies it (Impl-Plan §14.4). Status reflects the **core-RAG-slice** scope: ✅ deep · 🟦 minimal/scaffolded · 📄 documented.

| FR | Requirement (abbrev.) | Component / file | Endpoint | Test | Status |
|---|---|---|---|---|---|
| 5.1.1 | Org/collections/roles from console | `bootstrap.py`, `routers/admin.py` | `POST /users`, seeded org | T2 | 🟦 |
| 5.1.2 | Configure ingestion sources | `routers/documents.py` (upload); connectors | `POST /documents` | T2 | 🟦 |
| 5.1.3 | Select model provider w/o code change | `gateway/factory.py`, `routers/config.py` | `PUT /config/model-provider` | T15 | ✅ |
| 5.1.4 | Manage report templates / dashboards | `bootstrap.py`, `routers/reports.py` | `GET /report-templates` | T9 | 🟦 |
| 5.1.5 | OIDC/SAML SSO + local fallback | `core/security.py`, `routers/auth.py`, Keycloak realm | `POST /auth/login`, JWKS | T1 | ✅ |
| 5.1.6 | Two roles enforced everywhere | `core/deps.py` `require_role` | all routes | T11 | ✅ |
| 5.1.7 | Restrict upload/delete/config to admin | `core/deps.py`, route deps | `POST/DELETE /documents` | T11 | ✅ |
| 5.2.1 | Ingest PDF/DOCX/PPTX/TXT/HTML/CSV/XLSX | `ingest/parse.py` | `POST /documents` | T2 | ✅ |
| 5.2.2 | OCR scanned PDFs, page-level citations | `ingest/ocr.py` | ingest pipeline | T6 | ✅ |
| 5.2.3 | Capture filterable metadata | `db/models.py Document`, upload form | `GET /documents?...` | T2 | ✅ |
| 5.2.4 | Incremental re-index on add/update/remove | `ingest/pipeline.py` (content-hash), `remove_document` | pipeline | T2 | ✅ |
| 5.2.5 | Per-file success/failure report | `ingest/tasks.py`, `routers/ingestion.py` | `GET /ingestion/jobs/{id}` | T2 | ✅ |
| 5.3.1 | NL questions grounded in retrieved passages | `rag/pipeline.py`, `rag/prompt.py` | `POST /query` | T3 | ✅ |
| 5.3.2 | Hybrid retrieval + cross-encoder rerank | `stores/*`, `rag/fusion.py`, `reranker/app.py` | `POST /query` | T3 | ✅ |
| 5.3.3 | Resolvable citations (doc/section/page) | `rag/cite.py`, `routers/documents.py` | `GET /source?chunk_id=` | T4 | ✅ |
| 5.3.4 | Abstain on insufficient evidence | `rag/cite.py finalize` | `POST /query` | T5 | ✅ |
| 5.3.5 | Multi-turn + query scoping | `rag/pipeline.py rewrite`, scope filter | `POST /query` | T3 | ✅ |
| 5.3.6 | Answer only for authenticated users | `core/deps.py current_user` | all query routes | T1/T11 | ✅ |
| 5.4.1 | Summarize doc or topic, cited | `rag/summarize.py` | `POST /summarize` | T8 | ✅ |
| 5.4.2 | Reports from templates, cited values | `routers/reports.py` | `POST /reports` | T9 | 🟦 |
| 5.4.3 | Edit draft before export | `routers/reports.py` | `PATCH /reports/{id}` | T9 | 🟦 |
| 5.4.4 | Export PDF/DOCX with citations/marking | `reports/export.py` | `POST /reports/{id}/export` | T9 | 🟦 |
| 5.5.1 | Dashboards with correct aggregates | `structured/engine.py` | `GET /dashboards/fleet` | T10 | 🟦 |
| 5.5.2 | Consistent cross-filtering | Recharts screen | UI | T10 | 🟦 |
| 5.5.3 | Drill-down to source records | `structured/engine.py` | `POST /structured/query` | T10 | 🟦 |
| 5.6.1 | Immutable audit for every action | `core/audit.py` | all state-changing routes | T13 | ✅ |
| 5.6.2 | Searchable + exportable audit | `routers/audit.py` | `GET /audit`, `/audit/export` | T13 | ✅ |
| 5.6.3 | Log sources per answer for re-verify | `db/models.py Answer`, `routers/audit.py` | `GET /answers/{id}/verify` | T13 | ✅ |
| 5.6.4 | Health/usage metrics | `api/app.py` | `GET /health` | T1 | ✅ |
| §10.2 | Classification enforced at retrieval | `stores/qdrant_store.py`, `opensearch_store.py` filters | `POST /query` | T12 | ✅ |
| §10.3 | Hash-chained tamper-evidence | `core/audit.py verify_chain` | `GET /audit/verify` | T14 | ✅ |
| §7 | Cloud↔local gateway swap | `gateway/*`, `scripts/reindex.py` | `PUT /config/model-provider` | T15 | ✅ |
| §14 | Golden-set eval harness | `eval/run.py`, `data/golden/golden.json` | — | T16 | ✅ |

**Deferred (documented, not built in this POC scope):** live API/DB connectors with test-on-save (§6.5), full org-onboarding console, K8s/Helm air-gap deployment (charts scaffolded), vLLM/Ollama `local` provider runtime (config wired, servers not bundled).
