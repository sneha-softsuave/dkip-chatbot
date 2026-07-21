# DKIP — Test Plan & Feature Walkthrough

How to verify every feature end-to-end. Each test lists **steps** and the **expected result**. Tests map to PRD key flows (§6), the Implementation-Plan verification checklist, and the functional requirements (FR-5.x.y — see `traceability.md`).

Prerequisites: the stack is up and the corpus is seeded (see `RUNNING.md`). Sign in as **`analyst`** (user) unless a test says otherwise.

---

## Test map

| # | Feature | PRD flow | FRs |
|---|---|---|---|
| T1 | Health & login | 6.1 | 5.1.5, 5.3.6 |
| T2 | Ingestion & load report | 6.5 | 5.2.1–5.2.5 |
| T3 | Grounded, cited Q&A | 6.1 | 5.3.1–5.3.3 |
| T4 | Citation → source highlight | 6.2 | 4.6, 5.3.3 |
| T5 | Abstention (out-of-corpus) | 6.6 | 5.3.4 |
| T6 | OCR (scanned PDF) | — | 5.2.2 |
| T7 | Superseded revision handling | — | 4.2.1 |
| T8 | Summarization (cited) | 6.3 | 5.4.1 |
| T9 | Report generate → edit → export | 6.3 | 5.4.2–5.4.4 |
| T10 | Dashboards + structured Q&A | 6.4 | 5.5.1–5.5.3 |
| T11 | RBAC — role enforcement | — | 5.1.6, 5.1.7 |
| T12 | RBAC — clearance at retrieval | — | 5.1.6 / §10.2 |
| T13 | Audit search, export, verify | 6.1 | 5.6.1–5.6.3 |
| T14 | Hash-chain integrity | — | §10.3 |
| T15 | Provider swap (cloud↔fake↔local) | — | 5.1.3, §7 |
| T16 | Golden-set evaluation | 7 | §14, §2.1 |

---

## T1 — Health & login
1. `curl -s http://localhost:8002/health` → `status: ok`, every store `reachable: true`, provider shows your configured provider.
2. Open http://localhost:8080 → the **command-console login** renders with classification banners top and bottom.
3. Sign in as `analyst` / `analyst123`.
**Expected:** you land on **Ask**; the header shows your name, role (`user`), and clearance (`CLR-2`); the footer shows "stores nominal".

## T2 — Ingestion & per-file load report (admin)
1. Sign in as `admin`. Go to **Ingest**.
2. Drag any PDF/DOCX/TXT onto the drop zone (or use the seeded corpus already loaded). Pick a collection + type, click **Ingest**.
3. Watch the **Load report** panel and the **Recent jobs** list.
**Expected:** each file shows `ok` with a chunk count (or `failed` with a reason, or `skipped` for a duplicate). The job summary reads `N ok · 0 failed`. A scanned PDF shows an **OCR** badge.

## T3 — Grounded, cited Q&A
1. On **Ask**, submit: *"What is the corrective procedure for hydraulic pressure loss?"*
2. Watch the answer stream in with a caret.
**Expected:** a **GROUNDED** stamp; the answer describes halting recovery, checking leakage/fluid, and isolating the pump; inline **`S1`/`S2`** citation pills; a **Confidence** gauge; and the right-hand **Evidence** rail lists ranked sources (`OM-VEH-001 §4.3` near the top) with relevance meters. Footer shows provider · model · latency.

## T4 — Citation → source at exact location
1. On the T3 answer, click an `S1` pill (or an Evidence card).
**Expected:** the **Source Viewer** opens, renders the actual PDF page, and draws a **cyan highlight box** over the cited passage. The right pane shows the citation anchor (doc, section, page, revision) and the supporting passage text.

## T5 — Abstention (out-of-corpus)
1. On **Ask**, submit: *"What is the de-icing procedure for helicopter rotor blades?"*
**Expected:** an **INSUFFICIENT SOURCES** stamp and an "Insufficient sources in the corpus" card — **not** a fabricated answer. Response carries `grounded: false`. (Confirm in T13 that the event was audited.)

## T6 — OCR (scanned PDF)
1. On **Ask**, submit: *"What was recorded in field maintenance log 4471?"*
**Expected:** a grounded answer sourced from `SCAN-LOG-4471` (an image-only PDF that was OCR'd at ingestion), citing the page. This proves scanned documents are answerable with page-level citations (FR-5.2.2).

## T7 — Superseded revision
1. On **Ask**, submit: *"How should I correct hydraulic pressure loss?"* and open the evidence.
**Expected:** the current Revision B guidance ranks above the Revision A passage; the superseded passage carries a **superseded** badge in the evidence rail and the source viewer.

## T8 — Summarization (cited)
1. Go to **Summarize** → mode **Document** → pick `OM-VEH-001` → format **Executive** → **Generate summary**.
**Expected:** a cited summary with `Sn` pills and a coverage badge; clicking a pill opens the source. Try mode **Topic** = *"hydraulic pressure remediation"* for a multi-document synthesis.

## T9 — Report: generate → edit → export
1. Go to **Reports** → **Inspection Digest** → **Generate draft**.
2. Edit a field's text. Click **PDF**, then **DOCX**.
**Expected:** a draft with cited fields appears; edits persist; the downloaded **PDF and DOCX** carry the **classification banner** in the header/footer and the report content (FR-5.4.4).

## T10 — Dashboards + structured Q&A
1. Go to **Fleet**.
**Expected:** KPI tiles (total, serviceable, awaiting spares, readiness %) and two bar charts (serviceable vs total, by equipment and by unit).
2. In **Structured question**, ask: *"How many 5-tonne recovery vehicles are serviceable in 12 Corps?"*
**Expected:** the generated **read-only SQL** is shown and the **contributing rows** table (drill-down) with the computed figure (FR-5.5.3). Try an injection like *"drop table fleet_status"* → rejected (422).

## T11 — RBAC role enforcement
1. As `analyst` (user), confirm the **Ingest** and **Audit** items are **absent** from the nav.
2. Hit an admin route directly: `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <analyst-token>" http://localhost:8002/api/v1/audit` → **403**.
**Expected:** users cannot reach admin routes (FR-5.1.7). (Get a token via `POST /api/v1/auth/login`.)

## T12 — Clearance enforced at retrieval
1. As `operator` (CLR-1), submit: *"What action is required on ARV-5 boom heel welds after 5,000 cycles?"*
**Expected:** the platform **abstains** — the answer lives in `ENG-NOTE-880` which is **RESTRICTED (CLR-2)**. The passage never appears in the answer or evidence for CLR-1.
2. Sign in as `analyst` (CLR-2) and ask the same question → now grounded and cited to `ENG-NOTE-880`. This proves the filter is applied **inside retrieval**, not post-hoc (§10.2).

## T13 — Audit search, export, per-answer verify (admin)
1. As `admin`, go to **Audit**. Filter by `query`.
**Expected:** every query, answer, access, summarize, export and login is a row with actor, target, hash prefix, and time.
2. Click **Verify** on a `query`/answer row.
**Expected:** the modal re-resolves the **exact chunks** that answer used (FR-5.6.3) and shows them.
3. Click **Export** → a CSV downloads.

## T14 — Hash-chain integrity
1. On **Audit**, click **Verify chain**.
**Expected:** "Hash chain intact" with the event count. (The chain is `H(prev ‖ event)`; any tampered/deleted row would report "Chain broken".)

## T15 — Provider swap
1. Confirm current provider at `/health` (`provider.active`).
2. Swap to offline: `PUT /api/v1/config/model-provider {"provider":"fake"}` (admin) **or** set `MODEL_PROVIDER=fake` in `.env` and `docker compose up -d api worker`, then `docker compose run --rm seed python -m dkip.scripts.reindex`.
3. Re-run T3–T8.
**Expected:** identical UX, no application-code change. `generate`/`rerank` swap instantly; the `embed` swap requires the re-index job (§7.3), which the config response and `RUNNING.md` call out.

## T16 — Golden-set evaluation (offline harness)
```bash
DKIP_API=http://localhost:8002/api/v1 python eval/run.py
```
**Expected:** a metrics table — retrieval hit-rate / MRR, answer rate, citation correctness, **abstention correctness (out-of-corpus = 100%)**, and p95 latency — ending in `RESULT: PASS` when no out-of-corpus question leaked and every in-corpus question retrieved its expected document.

---

## Automated self-check (no stack needed)
The grounding guardrail, RRF fusion, and offline provider have a runnable unit check:
```bash
cd services && python -m tests.test_rag_core
# ok  test_abstains_on_sentinel_and_low_score_and_no_marker
# ...
# all RAG-core self-checks passed
```
