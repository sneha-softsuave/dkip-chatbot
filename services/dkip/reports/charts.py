"""Chart data for reports, from two sources with very different trust levels.

`from_structured` reads the whitelisted fleet table — the numbers are records,
so they are trustworthy by construction.

`from_evidence` pulls figures out of document prose, which is the easiest thing
in this system to get wrong. Three guards, and each one *rejects* rather than
repairs: the point must name a source id that was actually retrieved, the number
must appear verbatim in that source's text, and a chart with fewer than two
surviving points is discarded. A caller that gets None shows a cited figures
table instead — never an unsourced chart."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from dkip.core.llm_json import json_call
from dkip.structured.engine import fleet_aggregates

CHART_TYPES = ("bar", "line", "pie", "table", "none")

_EXTRACT = """From the numbered SOURCES below, extract the figures that answer:
"{question}"

Return JSON: {{"title": str, "unit": str,
 "points": [{{"label": str, "value": number, "sid": int}}]}}

Rules: every point's `sid` must be the source you took the number from; use only
numbers written in that source; if the sources carry no comparable figures,
return {{"points": []}}.

SOURCES:
{sources}"""


def _digits(value) -> list[str]:
    """The numeral forms a source might have used for this value."""
    out = {str(value)}
    try:
        f = float(value)
        if f.is_integer():
            out.add(str(int(f)))
        out.add(f"{f:,.0f}".replace(",", ""))
        out.add(f"{f:g}")
    except (TypeError, ValueError):
        pass
    return [v for v in out if v]


def from_structured(db: Session, chart_type: str = "bar") -> dict | None:
    """Chart from the fleet records. None when the table is empty/unavailable."""
    agg = fleet_aggregates(db)
    if agg.get("error"):
        return None
    if chart_type == "pie":
        kpi = agg.get("kpi") or {}
        points = [{"label": "Serviceable", "value": kpi.get("s") or 0},
                  {"label": "Unserviceable", "value": kpi.get("u") or 0},
                  {"label": "Awaiting spares", "value": kpi.get("a") or 0}]
        points = [p for p in points if p["value"]]
        if len(points) < 2:
            return None
        return {"type": "pie", "title": "Fleet composition", "source": "records",
                "series": ["value"], "points": points}

    rows = agg.get("by_equipment") or []
    if len(rows) < 2:
        return None
    return {"type": "line" if chart_type == "line" else "bar",
            "title": "Serviceable vs. total by equipment", "source": "records",
            "series": ["serviceable", "total"],
            "points": [{"label": r["equipment"], "serviceable": r["serviceable"],
                        "total": r["total"]} for r in rows]}


def from_evidence(gateway, evidence: list, question: str,
                  chart_type: str = "bar") -> dict | None:
    """Chart from figures written in the documents. None when unverifiable."""
    if not evidence:
        return None
    by_sid = {e.sid: e for e in evidence}
    sources = "\n\n".join(f"[S{e.sid}] {e.doc_code} §{e.section or '-'} p.{e.page_start}\n"
                          f"{e.text.strip()}" for e in evidence)
    data = json_call(gateway, _EXTRACT.format(question=question, sources=sources),
                     max_tokens=600)
    if not isinstance(data, dict):
        return None

    points, cited = [], []
    for p in data.get("points") or []:
        if not isinstance(p, dict):
            continue
        sid, label, value = p.get("sid"), p.get("label"), p.get("value")
        src = by_sid.get(sid if isinstance(sid, int) else -1)
        if src is None or not label or not isinstance(value, (int, float)):
            continue  # guard 1: the number must name a source we actually retrieved
        text = re.sub(r"[,\s]", "", src.text)
        if not any(d in text for d in _digits(value)):
            continue  # guard 2: the number must be written in that source
        points.append({"label": str(label)[:40], "value": value, "sid": sid})
        cited.append(sid)

    if len(points) < 2:
        return None  # guard 3: too little survived to chart honestly
    return {"type": chart_type if chart_type in ("bar", "line", "pie") else "bar",
            "title": str(data.get("title") or question)[:120],
            "unit": str(data.get("unit") or ""), "source": "documents",
            "series": ["value"], "points": points, "citation_sids": sorted(set(cited))}


def figures_table(evidence: list) -> dict:
    """Fallback when no chart can be justified: the passages, cited, as a table."""
    return {"type": "table", "title": "Cited figures", "source": "documents",
            "columns": ["Source", "Document", "Passage"],
            "rows": [[f"S{e.sid}", f"{e.doc_code} §{e.section or '-'} p.{e.page_start}",
                      e.text.strip()[:300]] for e in evidence[:8]]}
