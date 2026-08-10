---
description: Show where a greenfield planning run has got to — which documents exist, which phase is next, what questions are still open, and what is blocking. Reads only; changes nothing.
argument-hint: ""
---

# /discovery-status

Report the state of the planning run in this project. Read `docs/plan/` and answer without starting, resuming, or modifying anything.

## What to check

**1. Which documents exist**

| # | Document | Phase that produces it |
|---|---|---|
| 01 | problem-brief.md | 1 — Requirements |
| 02 | requirements.md | 1 — Requirements |
| 03 | research.md | 2 — Research |
| 04 | approaches.md | 3 — Competing approaches |
| 05 | decision.md | 4 — Decision |
| 06 | architecture.md | 6 — Detailed design |
| 07 | tech-stack.md | 6 — Detailed design |
| 08 | risks.md | 5 — Red team |
| 09 | roadmap.md | 7 — Roadmap |

Present, missing, or present-but-thin (a heading with no content under it counts as missing — an empty section is not progress).

**2. Which gate is next**

- No `02` → Phase 1 has not finished
- `02` present, no `05` → Gate 1 may be pending, or research and approaches are in flight
- `05` present, no `06` → Gate 2 may be pending
- All nine present → Phase 8 review, then delivery

**3. Open questions**

Every `OQ-n` in `02-requirements.md` that is still unanswered. For each: what it blocks, and who can answer it.

**Flag loudly any open question that later documents already depend on** — a design resting on an unanswered question is the most dangerous state this pipeline can be left in, because it looks finished.

**4. Assumptions in play**

Every `A-n` from `02-requirements.md`, and whether anything downstream has since confirmed or contradicted it.

**5. Anything stale**

If `02-requirements.md` was modified after `06-architecture.md` was written, the design may no longer match the requirements. Say so — file modification times are enough to spot it.

## Output

```
DISCOVERY STATUS — <project>

Documents:   <n>/9        Next phase: <n> — <name>
Awaiting:    <gate name, or "nothing — running">

| # | Document | State |
| 01 | problem-brief.md | complete |
| 04 | approaches.md    | missing |

Open questions: <n>
| # | Question | Blocks | Who can answer |

⚠️  Depends on an unanswered question:
  <document> assumes <OQ-n> resolves as <X>

Assumptions still unconfirmed: <n>
Stale: <any document older than something it depends on, or "none">

Next action: <the single most useful thing to do now>
```

## Rules

- Read-only. Do not write, resume, or continue the pipeline — report and stop.
- Do not summarise document contents. This answers "where are we", not "what does it say".
- If `docs/plan/` does not exist, say so and suggest `squad new <idea>`.
