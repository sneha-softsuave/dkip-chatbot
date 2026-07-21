"""Summarization (§5.9, FR-5.4.1). Single-doc map-reduce or multi-doc topic
synthesis, every material statement carrying a citation. Long docs are
summarized locally then composed so detail survives and each statement stays
anchored to a source chunk."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core.config import settings
from dkip.core.deps import Principal
from dkip.db.models import Chunk, Document
from dkip.gateway.factory import make_gateway
from dkip.rag.cite import bind_citations, citation_coverage, strip_markers
from dkip.rag.pipeline import resolve_collections
from dkip.rag.prompt import Evidence
from dkip.stores import opensearch_store, qdrant_store

_FORMATS = {
    "brief": "a tight 3-4 sentence brief",
    "detailed": "a detailed multi-paragraph summary",
    "bullet": "concise bullet points",
    "executive": "an executive summary with a one-line BLUF then key points",
}

_SYSTEM = ("Summarize ONLY from the numbered SOURCES. Every material statement "
           "must carry its [Sn] marker. Do not add facts not in the sources. "
           "Preserve procedure step order.")


def _evidence_from_chunks(chunks: list[Chunk], doc: Document) -> list[Evidence]:
    return [Evidence(sid=i + 1, chunk_id=c.id, doc_code=doc.doc_code,
                     title=doc.title, section=c.section, page_start=c.page_start,
                     page_end=c.page_end, text=c.text, score=1.0,
                     superseded=c.superseded, revision=c.revision)
            for i, c in enumerate(chunks)]


def _compose(evidence: list[Evidence], instruction: str) -> str:
    lines = [instruction, "", "SOURCES:", ""]
    for e in evidence:
        lines.append(f"[S{e.sid}] {e.doc_code} §{e.section or '-'} p.{e.page_start}")
        lines.append(e.text.strip())
        lines.append("")
    return "\n".join(lines)


def summarize_document(db: Session, *, doc_id: str, fmt: str, user: Principal) -> dict:
    doc = db.get(Document, doc_id)
    if not doc:
        raise ValueError("document not found")
    if doc.clearance_required > user.clearance:
        raise PermissionError("above clearance")
    chunks = db.execute(select(Chunk).where(Chunk.document_id == doc_id)
                        .order_by(Chunk.ordinal)).scalars().all()
    gateway = make_gateway()
    style = _FORMATS.get(fmt, _FORMATS["brief"])

    # map: summarize windows of chunks, then reduce (§5.9)
    window = 8
    partials: list[Evidence] = []
    if len(chunks) <= window:
        partials = _evidence_from_chunks(chunks, doc)
    else:
        for start in range(0, len(chunks), window):
            grp = chunks[start:start + window]
            ev = _evidence_from_chunks(grp, doc)
            # renumber sids per-window then remap to real sids after
            prompt = _compose(ev, f"Summarize this section into {style}, cited.")
            out = gateway.generate(prompt, system=_SYSTEM, temperature=0.0,
                                   max_tokens=500).text
            partials.append(Evidence(sid=len(partials) + 1,
                                     chunk_id=grp[0].id, doc_code=doc.doc_code,
                                     title=doc.title, section=grp[0].section,
                                     page_start=grp[0].page_start,
                                     page_end=grp[-1].page_end, text=out,
                                     score=1.0, revision=doc.revision))

    prompt = _compose(partials, f"Produce {style} of the document below, cited.")
    raw = gateway.generate(prompt, system=_SYSTEM, temperature=0.0,
                           max_tokens=900).text
    return {"doc_id": doc.id, "doc_code": doc.doc_code, "title": doc.title,
            "format": fmt, "summary": strip_markers(raw), "summary_marked": raw,
            "coverage": citation_coverage(raw),
            "citations": bind_citations(raw, partials),
            "provider": gateway.provider, "model": gateway.gen_model}


def summarize_topic(db: Session, *, topic: str, scope: dict, fmt: str,
                    user: Principal) -> dict:
    gateway = make_gateway()
    scope["collections"] = resolve_collections(db, scope.get("collections"))
    qvec = gateway.embed([topic])[0]
    dense = qdrant_store.search(qvec, scope, user.clearance, 12)
    lexical = opensearch_store.search(topic, scope, user.clearance, 12)
    ids, seen = [], set()
    for h in dense + lexical:
        if h["chunk_id"] not in seen:
            seen.add(h["chunk_id"]); ids.append(h["chunk_id"])
    rows = {c.id: c for c in db.execute(
        select(Chunk).where(Chunk.id.in_(ids[:10]))).scalars().all()}
    docs = {d.id: d for d in db.execute(select(Document)).scalars().all()}
    evidence = []
    for i, cid in enumerate(ids[:10], start=1):
        c = rows.get(cid)
        if not c:
            continue
        d = docs.get(c.document_id)
        evidence.append(Evidence(sid=i, chunk_id=c.id,
                                 doc_code=d.doc_code if d else "",
                                 title=d.title if d else "", section=c.section,
                                 page_start=c.page_start, page_end=c.page_end,
                                 text=c.text, score=1.0, revision=c.revision))
    style = _FORMATS.get(fmt, _FORMATS["detailed"])
    prompt = _compose(evidence, f"Write {style} on the topic '{topic}', cited "
                                "across the sources.")
    raw = gateway.generate(prompt, system=_SYSTEM, temperature=0.0,
                           max_tokens=900).text
    return {"topic": topic, "format": fmt, "summary": strip_markers(raw),
            "summary_marked": raw, "coverage": citation_coverage(raw),
            "citations": bind_citations(raw, evidence),
            "provider": gateway.provider, "model": gateway.gen_model}
