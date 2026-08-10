"""RAG core orchestration (§5, §18). rewrite -> retrieve(hybrid) -> fuse(RRF)
-> rerank(local) -> abstain-gate -> grounded synthesis -> guardrail -> cite,
then log the exact chunk ids for later re-verification (§10.3, FR-5.6.3)."""
from __future__ import annotations

import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core.config import settings
from dkip.core.deps import Principal
from dkip.db.models import (Answer, ChatMessage, ChatSession, Chunk, Collection,
                            Document)
from dkip.gateway.base import ModelGateway
from dkip.gateway.factory import make_gateway
from dkip.rag.cite import SENTINEL, finalize
from dkip.rag.fusion import dedupe_evidence, rrf
from dkip.rag.prompt import Evidence, SYSTEM, build_prompt
from dkip.stores import opensearch_store, qdrant_store


#: How many of the user's own turns the rewriter sees verbatim. Anything older
#: reaches it through the session's rolling summary instead.
RECENT_QUERIES = 10


def rewrite(gateway: ModelGateway, db: Session, question: str,
            session_id: str | None) -> str:
    """Multi-turn: fold prior turns into a standalone query (§5.7).

    The rewriter sees the last `RECENT_QUERIES` user questions verbatim, plus —
    once a conversation outruns that window — the session's rolling summary of
    everything older. Four turns of raw history (the previous behaviour) lost
    the thread on any conversation longer than a couple of exchanges."""
    if not session_id:
        return question

    prior = db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id, ChatMessage.role == "user")
        .order_by(ChatMessage.created_at.desc()).limit(RECENT_QUERIES + 1)).scalars().all()
    # The caller persists the incoming turn before querying, so the newest row is
    # usually this same question. Folding it in as "context" makes the rewriter
    # restate it as a fragment and the retrieval that follows misses.
    if prior and prior[0].content == question:
        prior = prior[1:]
    prior = prior[:RECENT_QUERIES]

    session = db.get(ChatSession, session_id)
    summary = (session.summary or "").strip() if session else ""
    if not prior and not summary:
        return question

    parts = []
    if summary:
        parts.append(f"Earlier in this conversation: {summary}")
    if prior:
        recent = "\n".join(f"- {m.content}" for m in reversed(prior))
        parts.append(f"The user's recent questions, oldest first:\n{recent}")
    context = "\n\n".join(parts)

    # "Resolve references" is the whole job — adding detail is not. Told only to
    # rewrite, the model helpfully grafts the conversation's subject onto a
    # question that never had one ("Is there a lifting embargo in place?" ->
    # "...for the ARV-5?"), and retrieval then goes looking for an ARV-5 embargo
    # that no document claims. So: leave a standalone question alone.
    prompt = (f"{context}\n\nThe user has asked a new question in this conversation.\n\n"
              f"If that question already stands on its own, return it EXACTLY as "
              f"written, unchanged.\n\nOnly if it cannot be understood without the "
              f"context above — it uses a pronoun (\"it\", \"they\"), an ellipsis "
              f"(\"and the torque?\"), or a back-reference (\"that one\") — rewrite it "
              f"into a standalone search query by resolving those references. Never "
              f"add a subject, product, or qualifier the user did not ask about.\n\n"
              f"Return only the query.\n\nNew question: {question}")
    try:
        out = gateway.generate(prompt, temperature=0.0, max_tokens=80)
        rewritten = out.text.strip().strip('"')
        return rewritten or question
    except Exception:
        return question


_SUMMARISE = ("Update a running summary of a conversation so later questions can be "
              "understood without re-reading it.\n\n"
              "Summary so far:\n{summary}\n\n"
              "Newly-aged-out turns:\n{turns}\n\n"
              "Return one updated summary, under 120 words, keeping the topics, "
              "documents and decisions a follow-up question might refer back to. "
              "Return only the summary.")


def fold_summary(gateway: ModelGateway, db: Session, session) -> None:
    """Fold turns that have aged out of the rewriter's window into the session
    summary. One short call per turn on long conversations — re-summarising the
    whole history every turn would grow without bound. Never raises: a failed
    summary costs context, not the turn."""
    try:
        msgs = db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id, ChatMessage.role == "user")
            .order_by(ChatMessage.created_at)).scalars().all()
        aged_out = len(msgs) - RECENT_QUERIES
        done = session.summarised_upto or 0
        if aged_out <= done:
            return
        pending = msgs[done:aged_out]
        if not pending:
            return
        turns = "\n".join(f"- {m.content[:300]}" for m in pending)
        out = gateway.generate(
            _SUMMARISE.format(summary=session.summary or "(nothing yet)", turns=turns),
            temperature=0.0, max_tokens=220)
        text = out.text.strip()
        if text:
            session.summary = text[:2000]
            session.summarised_upto = aged_out
            db.commit()
    except Exception:
        db.rollback()


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


def resolve_collections(db: Session, slugs: list[str] | None) -> list[str] | None:
    """Resolve collection slugs to UUIDs for store payload filtering (§5.3).
    The UI sends slugs; Qdrant/OpenSearch payloads store UUIDs."""
    if not slugs:
        return None
    rows = db.execute(
        select(Collection.id).where(Collection.slug.in_(slugs))
    ).scalars().all()
    return list(rows) if rows else None


def retrieve(db: Session, *, query: str, scope: dict, user: Principal,
             gateway: ModelGateway | None = None) -> tuple[list[Evidence], float]:
    """Retrieve → fuse → rerank, without synthesizing an answer.

    The report agent plans against evidence and must not pay for a generation
    it throws away, so this half of run_query is callable on its own."""
    gateway = gateway or make_gateway()
    # Resolve collection slugs to UUIDs before passing to stores (§5.3 scope filter)
    scope["collections"] = resolve_collections(db, scope.get("collections"))

    qvec = gateway.embed([query])[0]
    at = list(user.access_tags) if user.access_tags else None
    dense = qdrant_store.search(qvec, scope, user.clearance, settings.RETRIEVE_LIMIT, access_tags=at)
    lexical = opensearch_store.search(query, scope, user.clearance, settings.RETRIEVE_LIMIT, access_tags=at)
    fused = rrf(dense, lexical, settings.RRF_K, settings.RRF_KEEP)

    cands, texts = _load_evidence(db, fused)
    if not cands:
        return [], 0.0

    scores = gateway.rerank(query, texts)
    ranked = sorted(zip(cands, scores), key=lambda x: x[1], reverse=True)
    rerank_top = max(scores) if scores else 0.0
    ranked = dedupe_evidence(ranked)
    top = ranked[:settings.RERANK_TOP_K]
    # de-rank superseded evidence (4.2.1) and low-OCR-confidence chunks (§6.4):
    # push superseded and low-ocr-confidence entries down but keep them available
    top.sort(key=lambda x: (x[0]["chunk"].superseded,
                            -x[1] if (x[0]["chunk"].ocr_confidence or 1.0) >= 0.5 else -x[1] - 0.5))

    evidence: list[Evidence] = []
    for i, (cand, score) in enumerate(top, start=1):
        c, d = cand["chunk"], cand["doc"]
        evidence.append(Evidence(
            sid=i, chunk_id=c.id, doc_code=d.doc_code if d else "",
            title=d.title if d else "", section=c.section,
            page_start=c.page_start, page_end=c.page_end,
            char_start=c.char_start, char_end=c.char_end, text=c.text,
            score=round(float(score), 4), superseded=c.superseded,
            revision=c.revision))
    return evidence, rerank_top


def _retrieve_best(db: Session, *, question: str, qr: str, scope: dict,
                   user: Principal, gateway: ModelGateway):
    """Retrieve for the rewritten query — and, whenever the rewrite changed the
    question, for the user's own words too, keeping whichever retrieved better.

    The rewrite is a heuristic and sometimes hurts. It used to be retried only
    when the reranker score fell under the abstain gate, which missed the worse
    failure: a drifted query that retrieves *confidently* off-target evidence.
    That clears the gate, so no retry fired, and the model — handed passages
    that don't answer what was asked — refused, leaving the turn blank. Judging
    both by reranker score costs one extra retrieval on follow-up turns and
    picks the raw question exactly when the rewrite made things worse."""
    evidence, top = retrieve(db, query=qr, scope=scope, user=user, gateway=gateway)
    if qr.strip() != question.strip():
        raw_evidence, raw_top = retrieve(db, query=question, scope=scope, user=user,
                                         gateway=gateway)
        if raw_top > top:
            return raw_evidence, raw_top, question
    return evidence, top, qr


def run_query(db: Session, *, question: str, scope: dict, user: Principal,
              session_id: str | None = None, message_id: str | None = None) -> dict:
    t0 = time.perf_counter()
    gateway = make_gateway()

    qr = rewrite(gateway, db, question, session_id)

    evidence, rerank_top, qr = _retrieve_best(db, question=question, qr=qr,
                                              scope=scope, user=user, gateway=gateway)

    if not evidence:
        return _abstain(db, question, qr, gateway, t0, message_id, reason="no_candidates")

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


def stream_query(db: Session, *, question: str, scope: dict, user: Principal,
                 session_id: str | None = None, message_id: str | None = None):
    """run_query, but yielding answer text as the model produces it.

    Yields ("token", str) then exactly one ("done", result). The grounding
    guardrail can only run on the finished text, so the opening of the reply is
    held back until it is clear the model is not about to emit the
    INSUFFICIENT_SOURCES sentinel — that way an abstention never flashes
    on screen as an answer before being replaced."""
    t0 = time.perf_counter()
    gateway = make_gateway()
    # Stage frames let the UI say what is actually happening instead of showing
    # one undifferentiated spinner for the whole turn.
    yield "stage", {"stage": "understanding"}
    qr = rewrite(gateway, db, question, session_id)

    yield "stage", {"stage": "retrieving"}
    evidence, rerank_top, qr = _retrieve_best(db, question=question, qr=qr,
                                              scope=scope, user=user, gateway=gateway)

    if not evidence:
        yield "done", _abstain(db, question, qr, gateway, t0, message_id,
                               reason="no_candidates")
        return
    if rerank_top < settings.RERANK_ABSTAIN_THRESHOLD:
        yield "done", _abstain(db, question, qr, gateway, t0, message_id,
                               evidence=evidence, reason="below_threshold")
        return

    yield "stage", {"stage": "reading", "count": len(evidence)}
    prompt = build_prompt(qr, evidence)
    yield "stage", {"stage": "writing"}
    raw, held, releasing = "", "", False
    try:
        for piece in gateway.generate_stream(prompt, system=SYSTEM, temperature=0.0,
                                             max_tokens=900):
            raw += piece
            if releasing:
                yield "token", piece
                continue
            held += piece
            # Enough to tell an answer from the sentinel, without a visible pause.
            if len(held) >= len(SENTINEL) + 4 or "\n" in held:
                if SENTINEL in held.upper():
                    held = ""
                    break
                releasing = True
                yield "token", held
                held = ""
    except Exception:  # noqa: BLE001 — fall back to a single blocking call
        raw = gateway.generate(prompt, system=SYSTEM, temperature=0.0,
                               max_tokens=900).text
        if SENTINEL not in raw.upper():
            yield "token", raw
        held = ""
    if held and SENTINEL not in held.upper():
        yield "token", held

    result = finalize(raw, evidence, rerank_top, settings.RERANK_ABSTAIN_THRESHOLD)
    latency_ms = int((time.perf_counter() - t0) * 1000)
    ans = _persist(db, question, result, gateway, latency_ms, message_id,
                   [e.chunk_id for e in evidence] if not result["grounded"]
                   else [c["chunk_id"] for c in result["citations"]])
    result.update({"latency_ms": latency_ms, "provider": gateway.provider,
                   "model": gateway.gen_model, "rewritten_query": qr,
                   "answer_id": ans.id})
    yield "done", result


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
