---
name: squad-new
description: Multi-phase planning pipeline for a project that does not exist yet. Takes whatever you have — a full PRD, a rough spec, or one sentence of frustration — and produces a problem brief, requirements, researched prior art, several competing architectures, a judged decision, a detailed design, a red-team review, and a phased roadmap. Triggers on "squad new [anything]". Produces documents only; writes no code and performs no git actions.
---

# SQUAD NEW - GREENFIELD PLANNING PIPELINE

Activate with: **"squad new [whatever you have]"**

```
squad new <paste a PRD>
squad new we need a way for support agents to see a customer's full history in one place
squad new our onboarding takes three days and half the customers give up
squad new a tool that turns meeting recordings into follow-up tasks
```

Without "squad new", respond normally.

---

## What this pipeline is for, and what it is not

**For:** deciding what to build and how, before anything is built.

**Not for:** changing an existing codebase. That is the other `.claude` folder, triggered by `squad up`. Once this project has real code, swap folders.

**Output is documents.** This pipeline writes no code, scaffolds nothing, and installs nothing. It ends with a plan a person can build from.

### The honest limitation — state it, do not bury it

On an existing codebase, a verifier re-runs your tests and refutes claims with real output. **A document cannot be executed.** Nothing here can prove a design is correct.

What this pipeline can do is check that the documents agree with each other, that every requirement is served, that nothing was silently dropped, and that the decision was made against stated criteria rather than by momentum. That catches a great deal. It is not proof.

The word for the result is **reviewed**, never "validated" or "verified". Every delivery says so explicitly.

---

## THE NO-GIT RULE

No branch, no commit, no push, no PR, no issue. Enforced by `permissions.deny` in `.claude/settings.json`, not by judgement.

Where an existing codebase is in scope, this pipeline is **read-only on it**. It never edits code that already exists.

---

## PHASE 0 - INTAKE

### Step 0a - Read everything first

If the user supplied documents — a PRD, a spec, tickets, notes, a transcript — **read all of them before asking a single question.**

The fastest way to make someone abandon this tool is to interview them on what their own document already answers.

### Step 0a-pre - Is this actually a new project?

Count real source files, excluding `.claude/`, `docs/`, `node_modules/`, `.git/`,
`vendor/`, and build output.

If the repo **already contains a substantial codebase**, ask once before planning:

> **"This repo already has code. Do you mean:
> (a) a new service or subsystem to live alongside it — I'll plan it and read the
>     existing code for integration points, or
> (b) a change to what's already here — that's `squad up`, which reads the code,
>     runs your tests, and verifies the change, or
> (c) a rewrite of it — I'll plan that, and read the current system as a
>     requirements source?"**

(b) is not this pipeline. Hand it to `squad up` rather than producing a planning pack
for a task that wanted a code change — a nine-document plan is an expensive way to fix
a bug.

### Step 0b - Is there an existing codebase in scope?

Ask once, unless it is already obvious from the working directory:

> **"Is there an existing codebase this must live beside, replace, or integrate with?"**

| Answer | What happens |
|---|---|
| No — standalone, empty repo | Skip. No indexing, no mention of it again. |
| Yes — new service in an existing repo | Index it read-only. The researcher and architects query it for what exists to reuse and where the integration points are. |
| Yes — a rewrite | Index it read-only. **What the old system actually does is a requirements source**, and it will differ from its documentation. |
| Yes — must integrate with it | Index it read-only, focused on the interfaces. |

If yes: `npx gitnexus status`; if there is no live index, `npx gitnexus analyze` and wait. This is the only use of a code graph in this pipeline, and it is about *existing* code, never the thing being planned.

### Step 0c - Classify what the user brought

State the classification in one line before asking anything. Getting it wrong is cheap — the user corrects you immediately. Guessing silently is not.

| Input | Response |
|---|---|
| **Complete PRD / spec** | Gap-analysis only. Extract requirements as written; list what is missing, contradictory, or unstated; ask **only** about those. If it is genuinely complete, ask nothing and say so. |
| **Partial requirements** | Keep what exists verbatim. Interview only for the gaps. |
| **Pain points / an idea** | Full exploration. Phases 3-4 will return **multiple approaches**, not a single answer. |
| **A pre-chosen solution** | Push back **once**: what problem does this solve, what else would solve it? Record the answer; proceed with their choice if reaffirmed, noting it was pre-selected. |

**Never ask a question the supplied documents already answer.**

### Step 0d - Preflight and output directory

**Web access.** `domain-researcher` needs `WebSearch` / `WebFetch`. If they are unavailable, the pipeline still runs — but say so at the start of the run and record it verbatim in `03-research.md`:

```
No web access this session. Technology and prior-art findings come from model
knowledge, are undated, and may be out of date. Treat them as leads to check
rather than as evidence.
```

That degradation is acceptable. A silent one is not — an unsourced recommendation that looks researched is worse than an honest gap. Same rule for a failed index in 0b: the researcher falls back to Read/Grep and says so.

**Output directory.** Create `docs/plan/`. If it already has documents from a previous run, ask before overwriting — offer resume (`squad new resume`), start fresh, or write alongside in a dated subdirectory.

This is the whole preflight. There is no stack to detect, no lint command to resolve, and no code to index — that is what `squad setup` is for, once Phase 1 of the roadmap has produced real code.

---

## PHASE 1 - REQUIREMENTS

Dispatch `requirements-analyst`.

Produces `01-problem-brief.md` and `02-requirements.md`. Requirements are numbered `FR-n` / `NFR-n`, with constraints, open questions `OQ-n`, and assumptions `A-n`. **Every downstream traceability check depends on those IDs existing.**

Present the brief and requirements in chat, then:

> **"GATE 1: Is this the right problem?**
> **Reply `yes` to research and design solutions, or tell me what is wrong."**

→ **STOP. Wait.**

This gate exists because everything after it is expensive and all of it is aimed at whatever this document says. A wrong problem statement here wastes the entire run.

Pay particular attention to the brief's **"strongest argument against doing this at all"** section, and to whether the answer to "what breaks if this does not exist?" was compelling.

---

## PHASE 2 - RESEARCH

Dispatch `domain-researcher`. Where the scope is broad, dispatch two in parallel — one on prior art and the problem domain, one on the technology landscape.

Produces `03-research.md`. Every claim carries a fetched source and a date.

**If the research finds something that already solves this problem, surface it immediately and prominently** — before Phase 3, not buried in a document. "This already exists, here is what building instead would buy you" is one of the most valuable outcomes this pipeline can produce, and it must never be softened to keep the work alive.

---

## PHASE 3 - COMPETING APPROACHES

Dispatch **N `solution-architect` agents in parallel**, each with a different mandate, each blind to the others:

| Mandate | Optimises for | Include when |
|---|---|---|
| **A** | Fastest path to something users can use | Always |
| **B** | **Maximum reuse** — assemble from existing products, build only the glue | Always |
| **C** | Highest ceiling — scale, extensibility, new channels, a pivot | Unless the constraints rule out any long horizon |
| **D** | Lowest running cost at the stated scale | Only when cost is a stated constraint |

Three is the usual number. Four when cost genuinely binds.

**Why parallel and blind:** one agent asked for three options writes one real answer and two strawmen. Separate agents, each genuinely trying to win on its own axis, produce candidates that actually differ — which is the only thing that makes the next phase meaningful.

**The mandates must be ORTHOGONAL, or two of them buy you one design.** This was measured:
an earlier version paired "fastest to users" with "fewest moving parts" and got two
near-identical answers — same single deployable unit, same single database — because
fewer parts *is* faster to build. They are the same axis wearing two hats. "Maximum
reuse" is a genuinely different question (*what if we bought most of this?*) and forces
a different shape.

If you substitute your own mandate, apply that test first: **could an architect satisfy
both this mandate and another one with the same architecture?** If yes, you have three
slots and two real options.

Each writes `docs/plan/04-approaches/<letter>.md`. Merge into `04-approaches.md`.

Every approach must contain a **"What this is BAD at"** section with real content. An architect who cannot name their design's weaknesses has not understood it.

---

## PHASE 4 - DECISION

Dispatch `approach-judge`. It derives criteria from the requirements, **fixes the weights before scoring**, scores each approach, picks one, grafts good ideas from the runners-up, and records what would flip the decision.

Produces `05-decision.md`.

Present the scoring and the choice in chat, then:

> **"GATE 2: Approach <X> — <name>. Is this the right solution?**
> **Reply `yes` to detail it, or tell me to reconsider."**

→ **STOP. Wait.**

If the judge reports the approaches were **not genuinely distinct**, say so here rather than proceeding. That means Phase 3's mandates did not bite, and choosing between near-identical options is theatre.

---

## PHASE 5 - RED TEAM

Dispatch `risk-challenger` against the chosen approach.

Produces a first pass at `08-risks.md`. It runs **before** detailed design so that findings can change the design rather than merely annotate it.

**It is not permitted to conclude that everything looks fine.** Generic risks — "scope creep", "underestimation" — are a failure of this lane. Every finding names a mechanism specific to this design.

If it finds something that invalidates the chosen approach, **stop and return to Phase 4.** That is the process working, not failing.

---

## PHASE 6 - DETAILED DESIGN

Dispatch `system-designer`, giving it the decision and the red-team findings.

Produces `06-architecture.md` (components, boundaries, key flows, data model, interfaces, failure behaviour) and `07-tech-stack.md` (each choice with evidence and the rejected alternative).

If detailing reveals the chosen approach does not work, **it must say so loudly rather than quietly designing something else.** Discovering that here is a success; discovering it during the build is not.

---

## PHASE 7 - ROADMAP

Dispatch `roadmap-planner`.

Produces `09-roadmap.md`. **Phase 1 of that roadmap must be a walking skeleton** — one thin slice running end to end, not a horizontal layer. A vertical slice exercises every boundary in the design immediately, and boundaries are where designs turn out to be wrong.

No dates unless the constraints supplied real ones. Sequence and dependencies are knowable; durations are not, and a fabricated date becomes a commitment the moment somebody reads it.

---

## PHASE 8 - REVIEW AND DELIVERY

Two independent lanes, in parallel:

- **`plan-verifier`** — mechanical: traceability in both directions, cross-document consistency, evidence hygiene, completeness. Exhaustive, not sampled.
- **`plan-critic`** — judgement: over-engineering, scope drift, vagueness dressed up as decisiveness, a simpler path dismissed too quickly.

Neither wrote any of the documents. Both report to the orchestrator; neither edits.

**Blocking defects** — an unserved requirement, a contradiction between documents, a plan resting on an unanswered open question — go back to the owning lane for one round. Then re-verify.

Finally, write `SQUAD_NEW_DELIVERY_<slug>_<date>.md`:

````markdown
# GREENFIELD PLAN — <project>
**Date:** <date>   **Status:** REVIEWED (not validated — see Scope below)

## The problem
<two sentences from 01>

## What we recommend building
<the chosen approach, three sentences, and why it won>

## What we deliberately are not building
<from the out-of-scope list and the deferred table>

## The plan
| # | Document | What it holds |
| 01 | problem-brief.md | ... |
[through 09]

## Start here
**Phase 1 (walking skeleton):** <the one slice>
**It proves:** <which assumptions>

## Biggest risks
| Risk | Severity | Mitigation |
<the two or three existential ones from 08>

## Still open
| # | Question | Blocks | Who can answer |
<every OQ-n still unanswered>

## Review result
- Traceability: <n> requirements, <n> orphans
- Consistency: <n> conflicts found and resolved
- Critic verdict: <one line>

## Scope of this review
This plan has been checked for internal consistency and traceability. It has NOT been
validated — no code was written and nothing was executed. The design may still be
wrong in ways no document review can detect. Phase 1 exists to test that early.
````

Close the chat with:

```
Planned: <the recommendation in one line>.
9 documents in docs/plan/ — start with 01-problem-brief.md
Start building at: <phase 1 slice>
Still open: <n> questions — <the one that matters most>
Reviewed for consistency, not validated. Phase 1 is what tests it.
```

---

## PHASE 9 - HANDOFF TO BUILD

The plan is finished. This phase makes the *next* thing work without the user having to
set anything up again.

### Seed the stack profile

`squad up` reads `.claude/stack-profile.md` for the project's commands, project type,
and high-stakes areas. On a brand-new project that file cannot be generated by detection
— there is no code to detect. But it does not need to be: **this pipeline just chose the
stack deliberately, in `07-tech-stack.md`.**

So write a provisional `.claude/stack-profile.md` now, from what was decided:

| Field | Source |
|---|---|
| Languages, frameworks, package manager | `07-tech-stack.md` |
| Project type | `01-problem-brief.md` / the chosen approach |
| High-stakes areas | `08-risks.md` — the paths the red team called existential |
| Commands (lint / test / build) | **`TODO: not yet real`** — the tooling does not exist |
| Graph support | `TODO: measure after first code lands` |

Head the file with:

```
> PROVISIONAL — generated by `squad new` from the plan, not from code.
> The stack is decided; the commands are not yet real. Run `squad setup` once the
> first slice exists to replace the TODOs with commands that have actually been run.
```

That marker matters. A profile whose commands were never executed is exactly the failure
`squad setup` exists to prevent — the Verifier will run whatever the profile names. It
must be visibly provisional until proven.

### Close with the route forward

The delivery's last lines are the two commands that follow, in order:

```
Plan complete — 9 documents in docs/plan/

  Next, build Phase 1 (the walking skeleton):
      <the phase-1 slice, in one line, from 09-roadmap.md>

  When the first code exists:
      squad setup            # verifies the real lint/test/build commands
      squad up <task>        # the build pipeline takes over from here

  Everything after this uses `squad up`. This planning pipeline is done.
```

If the user asks this pipeline to start building, say no and point at `squad up`. This
lane produces documents; the build pipeline has the implementer, the verifier and the
code reviewer, and none of them exist here.

---

## SYSTEM RULES

| # | Rule |
|---|---|
| 1 | Documents only. No code, no scaffolding, no installs. |
| 2 | **No git, ever.** Enforced by `permissions.deny`. |
| 3 | Read all supplied documents before asking anything. |
| 4 | Never ask what the supplied documents already answer. |
| 5 | Never invent a requirement. Unknowns become open questions. |
| 6 | Both gates are mandatory: right problem, then right solution. |
| 7 | Architects run in parallel, blind to each other, with different mandates. |
| 8 | Every approach names what it is bad at. |
| 9 | The judge fixes weights before scoring. |
| 10 | The red team may not conclude "no significant risks". |
| 11 | Roadmap phase 1 is a vertical slice. |
| 12 | Every requirement is traceable forward; every component traceable back. |
| 13 | No fabricated numbers. `ESTIMATE:` with a derivation, or nothing. |
| 14 | No source cited that was not fetched this session. |
| 15 | Existing codebases are read-only, always. |
| 16 | The result is **reviewed**, never "validated". Say so in the delivery. |
| 17 | If prior art already solves this, say so plainly and early. |
| 18 | If the design is found to be wrong at any phase, stop and go back. |

---

## ESCAPE HATCHES

| Command | Effect |
|---|---|
| `squad new again` | Full restart from Phase 0 |
| `squad new fast` | Two architects instead of three or four; single review pass |
| `skip research` | Phase 2 omitted — see the warning below. Only when the user already holds the research. |
| `more approaches` | Add another architect with a mandate you name |
| `reconsider` | Return to Phase 4 and re-judge, keeping the research |
| `redesign` | Keep the decision, re-run Phase 6 |
| `squad new resume` | Read `docs/plan/`, find the last completed document, continue from there |

There is no way to skip the gates. Both exist before the expensive work that follows them, which is the entire point.

**Warning on `skip research`.** Measured in testing: without `03-research.md`, the judge
cannot answer its own most valuable question — *is the real answer "use the existing
thing"?* In one trial it flagged this as a **blocking** gap and wrote that the question
"is worth more than the difference between A, B and C", because if a commercial product
already covers most of the requirements, the right architecture is none of the candidates.

So when `skip research` is used, the orchestrator must:
- state at Phase 4 that the prior-art check could not be performed, and
- carry that into `05-decision.md` and the delivery as an open question, never let a
  winner be presented as though prior art had been ruled out.

Skipping research does not just remove a document. It removes the pipeline's only
mechanism for concluding that the project should not be built.

---

## WHEN THIS PIPELINE IS FINISHED

The plan is done; the project is not. When there is real code, this folder's job is over — swap in the `squad up` folder, run `squad setup`, and work from `09-roadmap.md` phase by phase.
