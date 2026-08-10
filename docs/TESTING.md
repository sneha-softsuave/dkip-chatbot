# DKIP — end-to-end test script

Walk this top to bottom before any release. It is ordered as a real session:
sign in → ask → report → admin → edge cases. Every step gives the **exact input**
and the **exact expected result**, so a pass/fail needs no judgement call.

Automated companion: `python qa/e2e_check.py` runs the API-level half of this
document (53 checks, ~2 minutes) and exits non-zero on any failure. Run it first —
if it is red, fix that before spending time on the manual pass.

For a walkthrough that starts from nothing — creating accounts, uploading two
supplied documents, and proving a confidential document is invisible to a standard
account — use **`docs/MANUAL-TEST-GUIDE.md`** instead. This document tests the
seeded corpus; that one tests the flow an evaluator actually walks.

| | |
|---|---|
| **Test accounts** | `admin` / `admin123` (administrator) · `analyst` / `analyst123` (restricted access) · `operator` / `operator123` (standard access) |
| **Seeded documents** | Operator Manual ARV-5 (`OM-VEH-001`, current + a superseded revision), Hydraulic SOP (`SOP-HYD-014`), Inspection Record (`INS-REC-2207`), Boom Weld Advisory (`ENG-NOTE-880`, restricted), Field Maintenance Log (`SCAN-LOG-4471`, scanned/OCR), Spares policy (`SOP-SPARES-01`) |
| **URLs** | UI `http://localhost:8080` (or `npm run dev -- --port 5176`) · API `http://localhost:8002/api/v1` |

Record results in the table at the end. Requirement mapping is in the last section.

---

## A. Environment

| # | Step | Expected |
|---|---|---|
| A.1 | `cd deploy/compose && docker compose up -d` | `api`, `worker`, `reranker`, `postgres`, `qdrant`, `opensearch`, `minio`, `web` all start |
| A.2 | Open `http://localhost:8002/health` | `status: ok`, every check `reachable: true`. **`worker` must be up or uploads never finish; `reranker` must be up or ranking degrades** |
| A.3 | `python qa/e2e_check.py` | `53/53 checks passed`, exit 0 |
| A.4 | `DKIP_API=http://localhost:8002/api/v1 python eval/run.py` | Retrieval hit-rate 100%, abstention 100%, `RESULT: PASS` |
| A.5 | `cd services && python -m pytest tests -q` | 13 passed (1 skipped — needs the store clients from the API image) |

## B. Sign-in and access

| # | Step | Expected |
|---|---|---|
| B.1 | Open the app signed out | Sign-in page. The hero takes 1–2 s to paint (3D scene) — not a failure |
| B.2 | Sign in as `admin` | Lands on Chat. Sidebar: Chat, Documents, Reports, then **Manage**: Knowledge base, Settings. Footer reads "Administrator" |
| B.3 | Wrong password | "invalid credentials"; stays on the sign-in page |
| B.4 | Sign out, sign in as `analyst` | Sidebar shows **only** Chat, Documents, Reports, Settings — no Manage group |
| B.5 | As `analyst`, enter `/knowledge` in the address bar | Redirected to Chat |
| B.6 | Collapse the sidebar (icon by the logo), reload | Stays collapsed; icons with tooltips; expanding restores it |

## C. Ingestion — administrator

Use any small PDF/DOCX/TXT of your own; steps below assume `QA-MANUAL.pdf`.

| # | Step | Expected |
|---|---|---|
| C.1 | Knowledge base → drop `QA-MANUAL.pdf` | Listed under "Ready to add" with a remove control |
| C.2 | Set Knowledge area / Kind / Who can see it → **Add documents** | `Processing…` then `Ready`. **No job ids, passage counts, or OCR flags anywhere on screen** |
| C.3 | Open Documents | The document is listed; **Open** shows the original file |
| C.4 | Chat → ask something only that document answers | Answered, citing that document |
| C.5 | Upload the same file again | Reported as skipped — duplicate content, not ingested twice |
| C.6 | Knowledge base → delete it → ask C.4 again | No longer cited (may now refuse — correct) |
| C.7 | Upload a scanned/photographed PDF | Reaches `Ready`; its text is answerable (OCR ran silently) |

## D. Answer correctness — the core

One fresh chat per question. **The answer must contain the fact and cite the document shown.**

| # | Ask exactly this | Expected fact | Must cite |
|---|---|---|---|
| D.1 | `What is the corrective procedure for hydraulic pressure loss?` | Halt recovery, inspect for leakage, top up OM-15, **isolate the pump** if pressure doesn't recover | `OM-VEH-001` §4.3 |
| D.2 | `What is the maximum winch line pull on the ARV-5?` | **9,000 kgf** single part of line; snatch block to double it | `OM-VEH-001` §4.4 |
| D.3 | `Which filter is specified for hydraulic under-pressure remediation?` | **HF-2205** return-line filter | `SOP-HYD-014` |
| D.4 | `What torque is specified for the hydraulic ram seal gland nut?` | **90 N·m** | `SOP-HYD-014` §3.5 |
| D.5 | `How many recovery vehicles were unserviceable in the Q2 inspection?` | **3** unserviceable (18 inspected, 14 serviceable, 1 awaiting spares) | `INS-REC-2207` |
| D.6 | `What is the minimum stock holding policy for the HF-2205 filter?` | Minimum **20** units, reorder at 8 | `SOP-SPARES-01` |
| D.7 | `What was recorded in field maintenance log 4471?` | ARV-5 #07, 120 bar, filter replaced, re-test 152 bar | `SCAN-LOG-4471` — proves OCR |
| D.8 | `What action is required on ARV-5 boom heel welds after 5,000 cycles?` | Dye-penetrant test; withdraw if the indication exceeds **3 mm** | `ENG-NOTE-880` |

**Refusals — these must NOT be answered:**

| # | Ask exactly this | Expected |
|---|---|---|
| D.9 | `What is the recommended de-icing procedure for helicopter rotor blades in Arctic conditions?` | "I couldn't find this in your documents" + next steps. **No invented answer** |
| D.10 | `What is the effective range of the fictional XM-9 anti-tank missile?` | Same |
| D.11 | `What is the muster pay scale for a junior commissioned officer?` | Same |

**Sources and supersession:**

| # | Step | Expected |
|---|---|---|
| D.12 | On D.2, click `N sources` | Ranked passage cards. **No two cards show the same passage** |
| D.13 | Click a numbered citation chip | Source viewer opens on the right page with the passage highlighted; shows document, reference, section, page — no internal scores or ids |
| D.14 | Re-read D.1 | Gives the **current** guidance (isolate the pump), never the superseded "top up and resume". A cited superseded document is marked "newer version exists" |
| D.15 | Spot-check a long answer against its cited passage | Every material statement is supported. Flag any sentence adding steps, tools or figures the source doesn't state |

## E. Access control — failures here are security defects

| # | Step | Expected |
|---|---|---|
| E.1 | As `operator`, ask D.8 | **Refuses.** No dye-penetrant or 3 mm, and `ENG-NOTE-880` is not cited |
| E.2 | As `analyst`, ask the same | Answered, citing `ENG-NOTE-880` |
| E.3 | As `analyst`, call an admin route directly — `curl -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <analyst-token>" http://localhost:8002/api/v1/users` | **403** |

## F. Conversation

| # | Step | Expected |
|---|---|---|
| F.1 | Ask D.2, then `And when should a snatch block be used?` | Answered in context — double the line for heavier casualties. Must not lose the subject or refuse |
| F.2 | Press Enter twice quickly | Sent once; no duplicate turn |
| F.3 | Type immediately after page load, before anything renders | The message still sends |
| F.4 | Reload mid-conversation | A new chat starts; earlier work is reached through Reports → Continue in chat |
| F.5 | Reports → open a report → **Continue in chat** | The original conversation reopens with its question and report card |

## G. Reports — created only in chat

| # | Step | Expected |
|---|---|---|
| G.1 | `Generate a report on fleet serviceability and hydraulic defects` | A **plan card**, not a report: title, 3–5 corpus-derived sections, three questions |
| G.2 | Inspect the questions | "Which sources?", "Include a chart?", "How detailed?" — each with one option pre-selected |
| G.3 | Edit the outline | Rename in the title field; reorder with the grip; remove with ×; add via "Add a section…" + `+` |
| G.4 | **Generate report** | "Writing the report…", then the report appears inline, every section carrying citation chips, plus a chart |
| G.5 | Check the chart | Fleet question → bar chart captioned "From your equipment records." |
| G.6 | New chat → `Generate a report on the hydraulic inspection procedure` → **Only documents I choose** | **Generate disabled** until a document is chosen ("Choose at least one document") |
| G.7 | **Choose documents** → select `SOP-HYD-014` | Capped at 3 selections; chip shown on the plan card |
| G.8 | Generate | Every citation is from `SOP-HYD-014` only. The chart is **not** a fleet chart — figures from the document, or an honest cited table |
| G.9 | `use a donut chart instead` | "Switched the chart to pie." and a donut renders |
| G.10 | `add a section on spares holdings` | Confirms; the new section is written and cited |
| G.11 | `remove the recommendations section` | Confirms; section gone |
| G.12 | `rename the title to Q2 Hydraulic Readiness` | Title updates |
| G.13 | `make the bottom line shorter` | Confirms the rewrite; section is shorter and **still cited** |
| G.14 | **PDF** | Downloads and opens: title, all sections, chart image + data table, **Sources** list, classification banner top and bottom |
| G.15 | **Word** | Same content, opens in Word |
| G.16 | Reports tab | Listed with date, section count, source count |
| G.17 | Open it | Full-page report, export buttons, **Continue in chat**. **No edit box** — editing happens only in chat |

## H. Interface

| # | Step | Expected |
|---|---|---|
| H.1 | Visit all five screens | Content starts at the same left edge everywhere; padding and gaps consistent |
| H.2 | Empty states: new chat, no reports, no documents | Each explains the next action; no blank panels |
| H.3 | Read every screen | **No engineering vocabulary**: chunk, embedding, vector, rerank, abstain, latency, provider, model name, hash, audit, SQL, job id |
| H.4 | Settings | Appearance, Your profile, and (admin) People + Add someone. **No model or AI-engine setting** |
| H.5 | Settings → add a person, then remove their access | Appears in the list; afterwards they cannot sign in |
| H.6 | Narrow the window | Layout reflows; nothing overlaps or scrolls sideways |

## I. Edge cases

| # | Step | Expected |
|---|---|---|
| I.1 | Send an empty message | Nothing sent, or a polite prompt — no error |
| I.2 | Paste ~5,000 characters and send | Handled; composer scrolls, layout holds |
| I.3 | `make it shorter` with no report in the chat | Doesn't fail — treated as a new request |
| I.4 | Ask, then `docker compose stop api`, ask again | Plain error in the transcript; no blank screen or endless spinner. Restart and continue |
| I.5 | Ask 30+ questions in a minute | Rate-limit message, not a crash |
| I.6 | Open a report URL that doesn't exist | "That report is no longer available" |

## J. Performance

| # | Step | Expected |
|---|---|---|
| J.1 | Time ten questions | p95 under ~5 s (last measured: 2.6 s) |
| J.2 | Time a 5-section report | 60–120 s on a cloud model; button stays in "Writing the report…" |
| J.3 | Two people at once | Both work; no cross-talk between conversations |
| J.4 | Browser console | No errors (React Router future-flag warnings are expected) |

---

## Results

| Section | Pass | Fail | Notes |
|---|---|---|---|
| A. Environment | | | |
| B. Sign-in and access | | | |
| C. Ingestion | | | |
| D. Answer correctness | | | |
| E. Access control | | | |
| F. Conversation | | | |
| G. Reports | | | |
| H. Interface | | | |
| I. Edge cases | | | |
| J. Performance | | | |

**Release criteria:** every D and E row passes (correctness and access control are
non-negotiable), `qa/e2e_check.py` is green, and no section has an unexplained failure.

---

## Requirement mapping

`traceability.md` cites the test ids used before this rewrite; the last column maps
them onto the sections above so the matrix still resolves.

| Section | PRD flow | FRs (see `traceability.md`) | Was |
|---|---|---|---|
| A, B | 6.1 | 5.1.5, 5.3.6 | T1 |
| C | 6.5 | 5.2.1–5.2.5 | T2 |
| D.1–D.8, D.12–D.13 | 6.1, 6.2 | 5.3.1–5.3.3, 4.6 | T3, T4 |
| D.7 | — | 5.2.2 (OCR) | T6 |
| D.9–D.11 | 6.6 | 5.3.4 (abstention) | T5 |
| D.14 | — | 4.2.1 (superseded revisions) | T7 |
| F.1 | — | 5.3.5 (multi-turn) | T3 |
| E | — | 5.1.6, 5.1.7, §10.2 (clearance inside retrieval) | T11, T12 |
| G | 6.3 | 5.4.1–5.4.4 | T8, T9 |
| A.4 | 7 | §14, §2.1 (golden set) | T16 |

Withdrawn with the screens they tested: **T10** (fleet dashboard and text-to-SQL),
**T13**/**T14** (audit browser and hash-chain UI), **T15** (provider swap UI — the
provider is now cloud-only and set by configuration). The underlying endpoints
still exist and can be exercised directly.

The audit trail (FR-5.6.1–5.6.3, §10.3) is still recorded for every query, upload
and export, but is deliberately not surfaced in the UI. Verify it directly if
required: `GET /api/v1/audit` and `GET /api/v1/audit/verify` as an administrator.

## Known behaviours — not defects

- The sign-in hero takes 1–2 s to paint while the 3D scene loads.
- Reloading starts a **new** chat; earlier conversations are reached through
  Reports → Continue in chat. There is no conversation list in the sidebar.
- A revision appears as a **new card** in the transcript rather than editing the
  card above it, so the history of changes stays visible.
- Answers cite up to 6 passages; duplicates of the same passage are collapsed, so
  a corpus holding a document twice yields fewer, distinct sources.
