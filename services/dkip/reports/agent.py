"""The report agent: propose a plan, generate against it, revise it.

Two rules shape this module.

1. Nothing is generated until the user has seen the plan. A report is expensive
   and opinionated; guessing the outline wastes a minute of model time and gets
   thrown away. So `plan_report` returns an outline plus the questions worth
   asking, each with a recommended default so "just generate it" still works.

2. A revision never rewrites cited prose in place. Editing a paragraph that
   carries [Sn] markers with a free-text instruction is how citations start
   pointing at sentences they no longer support — so content edits re-run
   retrieval for that one section under the amended instruction, and the markers
   are rebound from the evidence that produced them."""
from __future__ import annotations

import re
from copy import deepcopy

from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core.deps import Principal
from dkip.core.llm_json import json_call
from dkip.db.models import Chunk, Document, Report
from dkip.gateway.factory import make_gateway
from dkip.rag import pipeline
from dkip.rag.prompt import Evidence
from dkip.rag.summarize import summarize_topic
from dkip.reports import charts as chartlib

# "Standard" used to map to the most verbose format, which invited the model to
# pad a section with generic procedure prose the sources never stated. The middle
# setting now gets the BLUF-plus-key-points style its label implies.
DEPTHS = {"brief": "brief", "standard": "executive", "detailed": "detailed"}

_DEFAULT_SECTIONS = [
    {"key": "bluf", "label": "Bottom line", "prompt": "the bottom line up front"},
    {"key": "findings", "label": "Key findings", "prompt": "the key findings"},
    {"key": "detail", "label": "Detail", "prompt": "the supporting detail"},
    {"key": "actions", "label": "Recommended actions", "prompt": "recommended actions"},
]

_OUTLINE = """A user asked for this report: "{question}"

These passages are what the document library can support it with:

{sources}

Return JSON: {{"title": str, "sections": [{{"label": str, "prompt": str}}]}}

3 to 5 sections, ordered as they should be read. `prompt` is the instruction used
to write that section. Propose only sections the passages can actually support."""


def _retrieve(db: Session, question: str, scope: dict, user: Principal) -> list[Evidence]:
    """Top evidence for planning — retrieval only, no answer synthesis."""
    evidence, _ = pipeline.retrieve(db, query=question, scope=dict(scope), user=user)
    return evidence


def _slug(label: str, i: int) -> str:
    key = "".join(c if c.isalnum() else "_" for c in label.lower()).strip("_")
    return key or f"section_{i}"


def plan_report(db: Session, *, question: str, user: Principal,
                scope: dict | None = None) -> dict:
    """Outline + document candidates + the questions to ask before generating."""
    scope = scope or {}
    evidence = _retrieve(db, question, scope, user)
    gateway = make_gateway()

    sections = None
    if evidence:
        sources = "\n\n".join(f"[S{e.sid}] {e.doc_code} §{e.section or '-'}\n{e.text[:400]}"
                              for e in evidence[:6])
        data = json_call(gateway, _OUTLINE.format(question=question, sources=sources))
        if isinstance(data, dict) and isinstance(data.get("sections"), list):
            proposed = []
            for i, s in enumerate(data["sections"][:6]):
                label = str(s.get("label", "")).strip() if isinstance(s, dict) else ""
                if not label:
                    continue
                proposed.append({"key": _slug(label, i), "label": label[:60],
                                 "prompt": str(s.get("prompt") or label)[:200]})
            sections = proposed or None
        title = (data.get("title") if isinstance(data, dict) else None) or question
    else:
        title = question

    # Fallback outline: a shape that works for any topic, so an offline provider
    # or a malformed reply still yields a usable plan.
    sections = sections or _DEFAULT_SECTIONS

    # Documents the answer would draw on, best first, de-duplicated.
    seen, candidates = set(), []
    doc_codes = {e.doc_code for e in evidence}
    if doc_codes:
        rows = db.execute(select(Document).where(Document.doc_code.in_(doc_codes))).scalars().all()
        by_code = {d.doc_code: d for d in rows}
        for e in evidence:
            d = by_code.get(e.doc_code)
            if not d or d.id in seen:
                continue
            seen.add(d.id)
            candidates.append({"doc_id": d.id, "doc_code": d.doc_code, "title": d.title})

    return {"title": str(title)[:120], "sections": sections,
            "doc_candidates": candidates[:6],
            "questions": _questions(db, evidence, question)}


def _questions(db: Session, evidence: list[Evidence], question: str) -> list[dict]:
    """Only offer chart types the data can actually back."""
    options = [{"id": "none", "label": "No chart", "recommended": True}]
    if chartlib.from_structured(db, "bar"):
        options = [
            {"id": "bar", "label": "Bar — serviceable vs. total", "recommended": True},
            {"id": "line", "label": "Line — trend"},
            {"id": "pie", "label": "Donut — composition"},
            {"id": "table", "label": "Figures table"},
            {"id": "none", "label": "No chart"},
        ]
    elif evidence:
        options = [
            {"id": "bar", "label": "Bar — figures from the documents", "recommended": True},
            {"id": "table", "label": "Figures table"},
            {"id": "none", "label": "No chart"},
        ]
    return [
        {"id": "sources", "label": "Which sources?", "options": [
            {"id": "auto", "label": "Search all documents", "recommended": True},
            {"id": "pick", "label": "Only documents I choose"}]},
        {"id": "chart", "label": "Include a chart?", "options": options},
        {"id": "depth", "label": "How detailed?", "options": [
            {"id": "brief", "label": "Brief"},
            {"id": "standard", "label": "Standard", "recommended": True},
            {"id": "detailed", "label": "Detailed"}]},
    ]


def _write_cited_section(db: Session, *, section: dict, question: str, scope: dict,
                         depth: str, user: Principal) -> dict | None:
    """Write a section, insisting it comes back cited.

    A rewrite that loses its markers reads the same but can no longer be traced
    to anything — the one property this product exists to provide. One stricter
    retry, then give up and let the caller keep what it had."""
    written = _write_section(db, section=section, question=question, scope=scope,
                             depth=depth, user=user)
    if written["citations"]:
        return written

    strict = dict(section)
    strict["prompt"] = (f"{section.get('prompt') or section['label']}. Every statement "
                        "must carry its [Sn] source marker.")
    written = _write_section(db, section=strict, question=question, scope=scope,
                             depth=depth, user=user)
    return written if written["citations"] else None


def _write_section(db: Session, *, section: dict, question: str, scope: dict,
                   depth: str, user: Principal) -> dict:
    topic = f"{section['label']} — {section.get('prompt') or question}"
    s = summarize_topic(db, topic=topic, scope=dict(scope),
                        fmt=DEPTHS.get(depth, "detailed"), user=user)
    return {"key": section["key"], "label": section["label"],
            "prompt": section.get("prompt", ""),
            "value": s["summary"], "value_marked": s["summary_marked"],
            "citations": s["citations"]}


def required_clearance(db: Session, sections: list[dict]) -> int:
    """The highest clearance among the documents these sections quote.

    Retrieval already prevents a report being *written* from documents the author
    cannot read; this is what stops the finished report being *read* by someone
    who could not have written it."""
    chunk_ids = {c["chunk_id"] for s in sections for c in (s.get("citations") or [])
                 if c.get("chunk_id")}
    if not chunk_ids:
        return 1
    doc_ids = db.execute(select(Chunk.document_id)
                         .where(Chunk.id.in_(chunk_ids))).scalars().all()
    if not doc_ids:
        return 1
    levels = db.execute(select(Document.clearance_required)
                        .where(Document.id.in_(set(doc_ids)))).scalars().all()
    return max(levels or [1])


def generate_report(db: Session, *, question: str, title: str, sections: list[dict],
                    scope: dict, depth: str, chart: str, user: Principal,
                    session_id: str | None = None) -> Report:
    written = []
    for s in sections:
        section = _write_cited_section(db, section=s, question=question, scope=scope,
                                       depth=depth, user=user)
        # A section the sources cannot support is left in place and said so
        # plainly. Dropping it would silently change the outline the user
        # approved; filling it with uncited prose would be worse.
        written.append(section or {
            "key": s["key"], "label": s["label"], "prompt": s.get("prompt", ""),
            "value": "The documents in scope don't cover this.",
            "value_marked": "The documents in scope don't cover this.",
            "citations": [], "unsupported": True})

    built = []
    if chart and chart != "none":
        built = _build_chart(db, question=question, scope=scope, chart=chart, user=user)

    report = Report(org_id=user.org_id, template_id=None, session_id=session_id,
                    title=title or question, scope=scope, status="draft",
                    min_clearance=required_clearance(db, written),
                    draft={"title": title or question, "sections": written,
                           "charts": built, "question": question, "depth": depth})
    db.add(report)
    db.flush()
    return report


_RECORDS_RELEVANT = """A report is being written to answer: "{question}"

Separately, the system holds structured equipment records: per-unit counts of
vehicles held, how many are serviceable, and how many are not.

Would a chart built from those records be about the same subject as the report,
or about something else?

Return JSON: {{"relevant": true | false}}"""


def _use_records(gateway, question: str, scope: dict) -> bool:
    """Whether the equipment records actually answer this report's question.

    This was a twelve-word list ("fleet", "serviceable", "spares", …), which
    both over- and under-matched: it is the judgement that matters, not the
    vocabulary. The guard it protects still stands — a report on a hydraulics
    procedure must not get a fleet-holdings chart stapled to it — it is simply
    judged now. Unparseable replies fall to False, i.e. don't attach a chart we
    can't justify."""
    if scope.get("doc_ids"):
        return False  # the user named the documents; don't wander off them
    data = json_call(gateway, _RECORDS_RELEVANT.format(question=question[:300]),
                     max_tokens=30)
    return bool(data.get("relevant")) if isinstance(data, dict) else False


def _build_chart(db: Session, *, question: str, scope: dict, chart: str,
                 user: Principal) -> list[dict]:
    """Records when they're relevant, document figures otherwise, cited table as
    the fallback. A chart is never invented — see reports/charts.py guards."""
    if chart != "table" and _use_records(make_gateway(), question, scope):
        structured = chartlib.from_structured(db, chart)
        if structured:
            return [structured]
    evidence = _retrieve(db, question, scope, user)
    if chart != "table":
        extracted = chartlib.from_evidence(make_gateway(), evidence, question, chart)
        if extracted:
            return [extracted]
    return [chartlib.figures_table(evidence)] if evidence else []


_REVISE = """You are editing a report for the user. Work out what they want.

Sections (key — heading):
{keys}
Current chart: {chart}

The user said: "{instruction}"

Return JSON:
{{"op": "rewrite" | "add_section" | "remove_section" | "retitle" | "change_chart" | "style_chart",
 "section_key": one of the section keys above, or null,
 "label": new heading or new section name, or null,
 "chart": "bar" | "line" | "pie" | "table" | "none", or null,
 "color": a CSS colour, or null,
 "instruction": what to do, in your own words}}

How to choose:
- style_chart — they want the chart to LOOK different: a colour, a shade, a mood
  ("warmer", "less harsh", "match our branding"). Resolve whatever they describe
  into a concrete CSS colour in `color`, hex preferred. Do not change the chart type.
  But if they asked for a different colour without indicating WHICH — "change the
  colour of the bar chart", "pick another colour", "can we recolour this?" — leave
  `color` null. Null is how you ask them; a colour invented here is applied
  silently, so the user gets a choice they never made and no chance to say which.
  A described mood is not missing information — resolve those.
- change_chart — they want a different KIND of chart, or none at all. Put the kind
  in `chart`.
- rewrite — they want a section's wording, length, tone or content changed. Name it
  in `section_key`.
- add_section / remove_section — a section should appear or disappear.
- retitle — the report's own title should change; put the new title in `label`.

Judge the intent, not the words: the user may phrase any of these however they like."""

_OPS = {"rewrite", "add_section", "remove_section", "retitle", "change_chart",
        "style_chart"}
_CHART_KINDS = {"bar", "line", "pie", "table", "none"}
# A colour the model resolved from the user's wording. Hex, or a CSS colour name —
# both are rendered directly, so the shape is checked before it is stored.
_COLOUR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^[a-zA-Z]{3,20}$")


def _classify_revision(gateway, instruction: str, sections: list[dict],
                       charts: list[dict]) -> dict:
    """Work out what the user wants changed.

    The model does the interpreting — people phrase edits any way they like
    ("warm it up", "swap that for a donut", "trim the opener"), and a keyword
    table only ever covers the phrasings whoever wrote it happened to imagine.
    Its answer is validated against what this report actually has; anything
    unusable degrades to rewriting the section the instruction names."""
    keys = [s["key"] for s in sections]
    listing = "\n".join(f"  {s['key']} — {s['label']}" for s in sections) or "  (none)"
    chart_desc = ", ".join(f"{c.get('type')} '{c.get('title')}'" for c in charts) or "none"

    data = json_call(gateway, _REVISE.format(keys=listing, chart=chart_desc,
                                             instruction=instruction), max_tokens=300)
    if isinstance(data, dict) and data.get("op") in _OPS:
        op = dict(data)
        op["instruction"] = instruction  # keep the user's wording for the rewrite prompt
        if op.get("section_key") not in keys:
            op["section_key"] = _best_section(instruction, sections)
        if op["op"] == "change_chart" and op.get("chart") not in _CHART_KINDS:
            op["op"] = "style_chart"  # they meant appearance, not a different chart
        if op["op"] == "style_chart":
            colour = str(op.get("color") or "").strip()
            op["color"] = colour if _COLOUR_RE.match(colour) else None
        return op

    # The model gave nothing usable (offline provider, malformed JSON). Rewriting
    # the section they referred to is the least surprising thing to do.
    return {"op": "rewrite", "section_key": _best_section(instruction, sections),
            "instruction": instruction}


def _best_section(instruction: str, sections: list[dict]) -> str | None:
    """The section whose heading shares the most words with the instruction."""
    words = set(re.findall(r"[a-z]{3,}", instruction.lower()))
    best, score = None, 0
    for s in sections:
        overlap = len(words & set(re.findall(r"[a-z]{3,}", s["label"].lower())))
        if overlap > score:
            best, score = s["key"], overlap
    return best or (sections[0]["key"] if sections else None)


def revise_report(db: Session, *, report: Report, instruction: str,
                  user: Principal) -> tuple[dict, dict]:
    """Apply one instruction.

    Returns `(draft, outcome)`. The outcome describes what happened as data —
    `{"op": …, "applied": bool, …}` — and the caller decides how to say it. It
    used to return a hardcoded English sentence per branch, which meant every
    recolour read identically however it was asked for, and an under-specified
    request hit a dead-end string instead of being asked about.

    An outcome carrying `needs` is a request the agent cannot finish without one
    more detail; the caller turns that into a question with options."""
    # Deep copy, not dict(): a shallow copy shares the nested chart and section
    # objects with report.draft, so editing one in place changes the stored value
    # too — and SQLAlchemy, seeing old == new, writes nothing. The recolour said
    # it had worked and silently didn't.
    draft = deepcopy(report.draft or {})
    sections: list[dict] = list(draft.get("sections") or [])
    keys = [s["key"] for s in sections]
    question = draft.get("question") or report.title
    depth = draft.get("depth", "standard")
    op = _classify_revision(make_gateway(), instruction, sections,
                            draft.get("charts") or [])

    kind = op.get("op")
    if kind == "style_chart":
        charts = draft.get("charts") or []
        if not charts:
            return draft, {"op": "style_chart", "applied": False,
                           "reason": "no_chart_on_report"}
        if not op.get("color"):
            # The one detail we are missing. Asked about, not refused.
            return draft, {"op": "style_chart", "applied": False,
                           "needs": "colour", "reason": "no_colour_given"}
        for chart in charts:
            chart["color"] = op["color"]
        draft["charts"] = charts
        outcome = {"op": "style_chart", "applied": True, "color": op["color"]}

    elif kind == "retitle":
        new_title = (op.get("label") or "").strip() or report.title
        draft["title"] = new_title[:120]
        report.title = draft["title"]
        outcome = {"op": "retitle", "applied": True, "title": draft["title"]}

    elif kind == "change_chart":
        chart = op.get("chart") or "bar"
        if chart == "none":
            draft["charts"] = []
            outcome = {"op": "change_chart", "applied": True, "chart": "none"}
        else:
            # A colour the user already chose is theirs; changing the chart type
            # shouldn't quietly undo it.
            previous = next((c.get("color") for c in draft.get("charts") or []
                             if c.get("color")), None)
            draft["charts"] = _build_chart(db, question=question, scope=report.scope or {},
                                           chart=chart, user=user)
            if previous:
                for c in draft["charts"]:
                    c["color"] = previous
            built = (draft["charts"] or [{}])[0].get("type")
            outcome = ({"op": "change_chart", "applied": True, "chart": built}
                       if draft["charts"] else
                       {"op": "change_chart", "applied": False,
                        "reason": "no_chartable_figures"})

    elif kind == "remove_section" and op.get("section_key") in keys:
        removed = next(s["label"] for s in sections if s["key"] == op["section_key"])
        sections = [s for s in sections if s["key"] != op["section_key"]]
        draft["sections"] = sections
        outcome = {"op": "remove_section", "applied": True, "section": removed}

    elif kind == "add_section":
        label = (op.get("label") or "").strip()[:60]
        if not label:
            return draft, {"op": "add_section", "applied": False,
                           "needs": "what the section should cover",
                           "reason": "no_topic_given"}
        new_section = {"key": _slug(label, len(sections)), "label": label,
                       "prompt": op.get("instruction") or label}
        sections.append(_write_section(db, section=new_section, question=question,
                                       scope=report.scope or {}, depth=depth, user=user))
        draft["sections"] = sections
        outcome = {"op": "add_section", "applied": True, "section": label}

    else:  # rewrite - re-runs retrieval so the citations stay real
        key = op.get("section_key") if op.get("section_key") in keys else (keys[0] if keys else None)
        if not key:
            return draft, {"op": "rewrite", "applied": False, "reason": "report_is_empty"}
        idx = keys.index(key)
        base = sections[idx]
        amended = dict(base)
        amended["prompt"] = f"{base.get('prompt') or base['label']}. {instruction}"
        rewritten = _write_cited_section(db, section=amended, question=question,
                                         scope=report.scope or {}, depth=depth, user=user)
        if rewritten is None and base.get("citations"):
            outcome = {"op": "rewrite", "applied": False, "section": base["label"],
                       "reason": "would_lose_citations"}
        else:
            sections[idx] = rewritten or sections[idx]
            draft["sections"] = sections
            outcome = {"op": "rewrite", "applied": True, "section": base["label"]}

    report.draft = draft
    # A revision can add or drop sections, so what the report quotes — and
    # therefore who may read it — has to be recomputed, not carried over.
    report.min_clearance = required_clearance(db, draft.get("sections") or [])
    return draft, outcome
