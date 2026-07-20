"""Grounding guardrail + citation binding (§5.5, §5.6). Verifies the answer's
[Sn] markers resolve to real evidence, computes an explainable confidence
(reranker top-score + citation coverage), and decides abstention."""
from __future__ import annotations

import re

from dkip.rag.prompt import Evidence

_MARKER = re.compile(r"\[S(\d+)\]")
_SENT = re.compile(r"(?<=[.!?])\s+")
SENTINEL = "INSUFFICIENT_SOURCES"


def strip_markers(text: str) -> str:
    return _MARKER.sub("", text).replace("  ", " ").strip()


def citation_coverage(answer: str) -> float:
    sents = [s for s in _SENT.split(answer.strip()) if len(s.split()) > 4]
    if not sents:
        return 0.0
    cited = sum(1 for s in sents if _MARKER.search(s))
    return round(cited / len(sents), 3)


def used_source_ids(answer: str) -> set[int]:
    return {int(m) for m in _MARKER.findall(answer)}


def bind_citations(answer: str, evidence: list[Evidence]) -> list[dict]:
    by_sid = {e.sid: e for e in evidence}
    out = []
    for sid in sorted(used_source_ids(answer)):
        e = by_sid.get(sid)
        if not e:
            continue
        out.append({"sid": sid, "doc": e.doc_code, "title": e.title,
                    "section": e.section, "page": e.page_start,
                    "chunk_id": e.chunk_id, "superseded": e.superseded,
                    "revision": e.revision,
                    "char_start": e.char_start, "char_end": e.char_end})
    return out


def finalize(answer_raw: str, evidence: list[Evidence], rerank_top: float,
             threshold: float) -> dict:
    """Return the PRD-contract answer object (§9.3) after the guardrail."""
    abstain = (SENTINEL in answer_raw.upper()
               or rerank_top < threshold
               or not _MARKER.search(answer_raw))
    if abstain:
        return {"answer": None, "grounded": False, "citations": [],
                "confidence": 0.0, "evidence": [e.__dict__ for e in evidence]}

    coverage = citation_coverage(answer_raw)
    citations = bind_citations(answer_raw, evidence)
    confidence = round(0.6 * min(rerank_top, 1.0) + 0.4 * coverage, 3)
    return {"answer": strip_markers(answer_raw), "answer_marked": answer_raw,
            "grounded": True, "citations": citations, "confidence": confidence,
            "coverage": coverage, "evidence": [e.__dict__ for e in evidence]}
