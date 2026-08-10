<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dkip-chatbot** (2141 symbols, 4340 relationships, 160 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/dkip-chatbot/context` | Codebase overview, check index freshness |
| `gitnexus://repo/dkip-chatbot/clusters` | All functional areas |
| `gitnexus://repo/dkip-chatbot/processes` | All execution flows |
| `gitnexus://repo/dkip-chatbot/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

# DKIP — project guide

Defense Knowledge Intelligence Platform (POC1). FastAPI + RAG backend in `services/`,
React SPA in `apps/web/`, docker compose stack in `deploy/compose/`.

## Essential commands

| Purpose | Command | Run from |
|---|---|---|
| Bring the stack up | `docker compose up -d` | `deploy/compose` |
| Backend tests | `python -m pytest tests -q` | `services` |
| Frontend typecheck | `npx tsc --noEmit -p tsconfig.json` | `apps/web` |
| Frontend build | `npm run build` | `apps/web` |
| Frontend dev server | `npm run dev -- --port 5176` | `apps/web` |
| API regression (53 checks) | `python qa/e2e_check.py` | repo root |
| UI e2e | `npx playwright test` | `apps/web` |
| Retrieval eval | `DKIP_API=http://localhost:8002/api/v1 python eval/run.py` | repo root |

No linter or formatter is configured in this repo. See `docs/TESTING.md` for the
full release checklist and `docs/RUNNING.md` for environment setup.

## Squad stack

- `.claude/stack-profile.md` — **generated** by `squad-setup`. Commands, test
  conventions, review lens, and high-stakes areas; every squad agent reads it.
  Regenerate after a major stack change; do not hand-edit for one-off facts.
- `squad up [task]` — multi-phase pipeline for bugs, features, and refactors.
- Code questions route through the deep-codebase-explorer skill.
- GitNexus MCP calls must pass `repo: "dkip-chatbot"` — several repos are indexed
  on this machine and the tools will not disambiguate on their own.
