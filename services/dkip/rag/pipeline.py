"""RAG core orchestration (§5, §18). rewrite -> retrieve(hybrid) -> fuse(RRF)
-> rerank(local) -> abstain-gate -> grounded synthesis -> guardrail -> cite,
then log the exact chunk ids for later re-verification (§10.3, FR-5.6.3)."""
from __future__ import annotations

import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core.config import settings
from dkip.core.deps import Principal
from dkip.db.models import Answer, Chunk, ChatMessage, Document
from dkip.gateway.base import ModelGateway
from dkip.gateway.factory import make_gateway
from dkip.rag.cite import finalize
from dkip.rag.fusion import rrf
from dkip.rag.prompt import Evidence, SYSTEM, build_prompt
from dkip.stores import opensearch_store, qdrant_store


def rewrite(gateway: ModelGateway, db: Session, question: str,
            session_id: str | None) -> str:
    """Multi-turn: fold prior turns into a standalone query (§5.7). Skipped for
    the first turn to avoid needless latency."""
    if not session_id:
        return question
    prior = db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc()).limit(4)).scalars().all()
    if not prior:
        return question
    history = "\n".join(f"{m.role}: {m.content}" for m in reversed(prior))
    prompt = (f"Conversation so far:\n{history}\n\nRewrite the user's new "
              f"question as a standalone search query, resolving pronouns and "
              f"references. Return only the rewritten query.\n\nNew question: {question}")
    try:
        out = gateway.generate(prompt, temperature=0.0, max_tokens=80)
        rewritten = out.text.strip().strip('"')
        return rewritten or question
    except Exception:
        return question


def _load_evidence(db: Session, fused: list[dict]) -> tuple[list[dict], list[str]]:
    ids = [f["chunk_id"] for f in fused]
    rows = {c.id: c for c in db.execute(
        select(Chunk).where(Chunk.id.in_(ids))).scalars().all()}
    docs = {d.id: d for d in db.execute(select(Document)).scalars().all()}
    cands, texts = [], []
    for f in fused:
        c = rows.get(f["chunk_id"])
        if not c:
            continue
        d = docs.get(c.document_id)
        cands.append({"chunk": c, "doc": d, "rrf": f["rrf"]})
        texts.append(c.text)
    return cands, texts


def run_query(db: Session, *, question: str, scope: dict, user: Principal,
              session_id: str | None = None, message_id: str | None = None) -> dict:
    t0 = time.perf_counter()
    gateway = make_gateway()

    qr = rewrite(gateway, db, question, session_id)

    qvec = gateway.embed([qr])[0]
    dense = qdrant_store.search(qvec, scope, user.clearance, settings.RETRIEVE_LIMIT)
    lexical = opensearch_store.search(qr, scope, user.clearance, settings.RETRIEVE_LIMIT)
    fused = rrf(dense, lexical, settings.RRF_K, settings.RRF_KEEP)

    cands, texts = _load_evidence(db, fused)
    if not cands:
        return _abstain(db, question, qr, gateway, t0, message_id, reason="no_candidates")

    scores = gateway.rerank(qr, texts)
    ranked = sorted(zip(cands, scores), key=lambda x: x[1], reverse=True)
    rerank_top = max(scores) if scores else 0.0
    top = ranked[:settings.RERANK_TOP_K]
    # de-rank superseded evidence (4.2.1): keep but push down
    top.sort(key=lambda x: (x[0]["chunk"].superseded, -x[1]))

    evidence: list[Evidence] = []
    for i, (cand, score) in enumerate(top, start=1):
        c, d = cand["chunk"], cand["doc"]
        evidence.append(Evidence(
            sid=i, chunk_id=c.id, doc_code=d.doc_code if d else "",
            title=d.title if d else "", section=c.section,
            page_start=c.page_start, page_end=c.page_end, text=c.text,
            score=round(float(score), 4), superseded=c.superseded,
            revision=c.revision))

    if rerank_top < settings.RERANK_ABSTAIN_THRESHOLD:
        return _abstain(db, question, qr, gateway, t0, message_id,
                        evidence=evidence, reason="below_threshold")

    prompt = build_prompt(qr, evidence)
    completion = gateway.generate(prompt, system=SYSTEM, temperature=0.0,
                                  max_tokens=900)
    result = finalize(completion.text, evidence, rerank_top,
                      settings.RERANK_ABSTAIN_THRESHOLD)

    latency_ms = int((time.perf_counter() - t0) * 1000)
    ans = _persist(db, question, result, gateway, latency_ms, message_id,
                   [e.chunk_id for e in evidence] if not result["grounded"]
                   else [c["chunk_id"] for c in result["citations"]])
    result.update({"latency_ms": latency_ms, "provider": gateway.provider,
                   "model": gateway.gen_model, "rewritten_query": qr,
                   "answer_id": ans.id})
    return result


def _abstain(db, question, qr, gateway, t0, message_id, *, evidence=None,
             reason="") -> dict:
    latency_ms = int((time.perf_counter() - t0) * 1000)
    result = {"answer": None, "grounded": False, "citations": [],
              "confidence": 0.0, "rewritten_query": qr,
              "evidence": [e.__dict__ for e in (evidence or [])],
              "abstain_reason": reason}
    ans = _persist(db, question, result, gateway, latency_ms, message_id, [])
    result.update({"latency_ms": latency_ms, "provider": gateway.provider,
                   "model": gateway.gen_model, "answer_id": ans.id})
    return result


def _persist(db, question, result, gateway, latency_ms, message_id,
             source_chunk_ids) -> Answer:
    ans = Answer(message_id=message_id, question=question,
                 answer_text=result.get("answer"),
                 grounded=result.get("grounded", False),
                 confidence=result.get("confidence", 0.0),
                 source_chunk_ids=source_chunk_ids,
                 citations=result.get("citations", []),
                 provider=gateway.provider, model=gateway.gen_model,
                 latency_ms=latency_ms)
    db.add(ans)
    db.commit()
    return ans
