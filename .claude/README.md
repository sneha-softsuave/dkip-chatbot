# .claude/ — one workspace, two pipelines

Covers a project's whole life: decide what to build, then build it.

| You have | Command | You get |
|---|---|---|
| An idea, a PRD, or a problem | **`squad new <anything>`** | A researched, argued, reviewed plan — 9 documents. No code. |
| A codebase and a task | **`squad up <anything>`** | The change made, criticised, verified, reviewed — plus a ready-to-run commit and PR block. |

`squad new` hands off to `squad up` when the project grows real code. Both live in this
one folder; nothing to swap.

**Neither touches git.** No branch, no commit, no push, no PR — enforced by
`permissions.deny` in `settings.json`, not by the agent's judgement. You get the
commands; you run them.

## Install

```bash
cp -r .claude /path/to/your-project/

cat >> .gitignore <<'EOF'
.claude/settings.local.json
.gitnexus/
SQUAD_PLAN_*.md
SQUAD_DELIVERY_*.md
EOF
```

**Existing codebase?** Open it in Claude Code and say `squad setup`. It detects your
stack, resolves your real lint/test/build commands, indexes the code graph, and writes
`stack-profile.md`. Restart Claude Code once afterwards.

**Empty repo?** Nothing to set up. Just say `squad new <your idea>`.

Needs Node.js (code graph) and bash — on Windows that ships with Git.

## The lifecycle

```
   squad new "support agents can't see a customer's history in one place"
        |
        |- Phase 0   read what you brought, classify it
        |- Phase 1   requirements            -- GATE: right problem?
        |- Phase 2   research: prior art, tech landscape
        |- Phase 3   3 architects, parallel and blind, different mandates
        |- Phase 4   judge: weights fixed first -- GATE: right solution?
        |- Phase 5   red team attacks the choice
        |- Phase 6   architecture, data model, tech stack
        |- Phase 7   roadmap -- Phase 1 is a walking skeleton
        |- Phase 8   traceability + critic
        `- Phase 9   seeds stack-profile.md from the chosen stack
        |
        v
   you build Phase 1   (or: squad up build phase 1)
        |
        v
   squad setup         -- replaces the planned commands with ones that actually run
        |
        v
   squad up "the settings page 500s when an org has no billing contact"
        |- Phase 0    stack profile, graph gate
        |- Phase 0.5  task shaping: bug? feature? refactor? tests? perf?
        |- Phase 1    plan                   -- GATE
        |- Phase 2    implement
        |- Phase 3-4  critic, then verifier re-runs every claim
        |- Phase 4.5  code review, impact analysis on every changed symbol
        `- Phase 5    delivery + your commit/PR block
```

Each pipeline stops twice for you, both times before the expensive work that follows.

## squad up — anything on an existing codebase

```
squad up the settings page returns 500 when the org has no billing contact
squad up add CSV export to the reports endpoint
squad up write tests for the notification service
squad up the ticket list is slow once a tenant has 10k rows
squad up rename OrderService to FulfilmentService everywhere
squad up why do we call the settings API twice on page load?
```

Same pipeline every time; what changes is the prep. A bug goes to `bug-triager` for the
root cause *and every sibling call site with the same defect*. A feature goes to
`code-explorer` to find where it plugs in and which conventions to match. A refactor
starts from graph impact, because there the blast radius is the whole risk. A
performance task must take a before-measurement or it cannot prove it helped. An
investigation can end with an answer and no code change — a valid outcome, not a failure.

## squad new — a project that doesn't exist yet

```
squad new <paste a PRD>
squad new our onboarding takes three days and half the customers give up
```

It adapts to what you bring. A complete PRD gets **gap-analysed** — it asks only about
what's genuinely missing, and nothing if the document is complete. A sentence of pain
gets full exploration. Measured on the same domain: the PRD run extracted 109
requirements and asked 10 questions, listing 12 more it skipped because the document
already answered them; the pain-points run extracted 6 and refused to invent the rest.

Output: `docs/plan/01-problem-brief.md` … `09-roadmap.md`.

## The agents

**Build pipeline** — `bug-triager`, `code-explorer`, `squad-planner`,
`squad-implementer`, `squad-critic`, `squad-verifier`, `squad-code-reviewer`

**Planning pipeline** — `requirements-analyst`, `domain-researcher`,
`solution-architect` (×3, parallel and blind), `approach-judge`, `system-designer`,
`risk-challenger`, `roadmap-planner`, `plan-verifier`, `plan-critic`

The rule both share: **whoever produced something never grades it.** The verifier re-runs
every command itself and treats anything it cannot reproduce as false.

Models are assigned per lane rather than uniformly — opus where the work is novel
synthesis or adversarial judgement, sonnet where it is structured checking against
explicit criteria.

Every agent reads a rigor contract first: `fable-rigor` for code lanes (never cite a file
you did not open; evidence or it did not happen), `research-rigor` for planning lanes
(never cite a source you did not fetch; never state an assumption in the voice of a fact).

## What each can and cannot prove

**`squad up` verifies by execution.** It re-runs your tests and refutes claims with real
output. That is strong.

**`squad new` cannot.** A document cannot be executed, so nothing there proves a design
correct. Phase 8 checks traceability (every requirement served, every component
justified) and cross-document consistency — real defects, commonly missed, but not proof.
Its output is described as **reviewed**, never "validated", and the roadmap's walking
skeleton exists precisely to test the design the only way a design can be tested.

## Commands

| Command | Effect |
|---|---|
| `squad new <anything>` | Plan a new project |
| `squad up <anything>` | Do the work on an existing one |
| `squad setup` | Detect the stack, verify commands, index the graph |
| `/squad-architect <task>` | Recommend an approach without running it |
| `/discovery-status` | Where a plan got to, what is still open |
| `squad up fast` / `squad new fast` | Fewer review rounds |
| `squad up ULTIMATE` | Maximum depth for risky work |
| `squad resume` / `squad new resume` | Continue an interrupted run |

## Customising

Everything project-specific lives in **one generated file**, `.claude/stack-profile.md`.
That is what makes the folder portable — the same agents work in a TypeScript service and
a Python CLI. If a second project ever requires editing an agent file, that fact belongs
in the profile instead.

Personal overrides go in `.claude/settings.local.json` (gitignored), never the team file.

## Measured behaviour (verified, not assumed)

- `gitnexus analyze` **appends** to `CLAUDE.md`/`AGENTS.md` inside `<!-- gitnexus:start -->`
  markers — surrounding content untouched, byte for byte. It **overwrites**
  `.claude/skills/gitnexus/` with its own copies, which is why none ship here.
- The index lives in `.gitnexus/`; it adds itself to `.git/info/exclude`.
- Indexed Python and TypeScript in one repo — 4,216 nodes, 11,176 edges, 62s. It
  publishes no supported-language list, so setup measures per-repo and records
  `Graph support: full | partial | none`. At `none` the pipeline still runs and says so.
