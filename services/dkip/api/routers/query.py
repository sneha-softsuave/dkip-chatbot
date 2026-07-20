"""Grounded Q&A routes (§9.3). POST /query (PRD contract) + streaming variant.
Every query+answer is audited with the exact source chunk ids (FR-5.6.3)."""
from __future__ import annotations

import json
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from dkip.api.schemas import QueryIn, QueryOut
from dkip.core import audit
from dkip.core.config import settings
from dkip.core.deps import Principal, current_user
from dkip.db.base import SessionLocal, get_db
from dkip.gateway.factory import make_gateway
from dkip.rag import pipeline

router = APIRouter(tags=["query"])

# ponytail: in-process sliding-window rate limit (§10.6). Swap to Redis if the
# API runs multi-replica.
_hits: dict[str, deque] = defaultdict(deque)


def _rate_limit(subject: str) -> None:
    now = time.time()
    dq = _hits[subject]
    while dq and now - dq[0] > 60:
        dq.popleft()
    if len(dq) >= settings.QUERY_RATE_PER_MIN:
        raise HTTPException(429, "rate limit exceeded")
    dq.append(now)


@router.post("/query", response_model=QueryOut)
def query(body: QueryIn, request: Request, db: Session = Depends(get_db),
          user: Principal = Depends(current_user)):
    _rate_limit(user.subject)
    result = pipeline.run_query(db, question=body.question,
                                scope=body.scope.model_dump(), user=user,
                                session_id=body.session_id)
    audit.record(db, action="query", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="answer",
                 target_id=result.get("answer_id"),
                 request_meta={"question": body.question,
                               "grounded": result["grounded"],
                               "confidence": result.get("confidence", 0.0),
                               "source_chunk_ids": [c["chunk_id"] for c in result.get("citations", [])],
                               "provider": result.get("provider")})
    return result


@router.post("/query/stream")
def query_stream(body: QueryIn, request: Request,
                 user: Principal = Depends(current_user)):
    """SSE: retrieval + guardrail run server-side; answer tokens stream, then a
    final `done` event carries citations/confidence/grounded."""
    _rate_limit(user.subject)

    def gen():
        db = SessionLocal()
        try:
            gateway = make_gateway()
            # Full pipeline (retrieve -> rerank -> guardrail -> synthesize) runs
            # server-side; tokens then stream for the caret effect, guaranteeing
            # the grounding guardrail ran before any token is shown.
            result_meta = pipeline.run_query(db, question=body.question,
                                              scope=body.scope.model_dump(),
                                              user=user, session_id=body.session_id)
            yield f"event: meta\ndata: {json.dumps({'rewritten_query': result_meta.get('rewritten_query', ''), 'provider': gateway.provider})}\n\n"
            if not result_meta["grounded"]:
                yield f"event: token\ndata: {json.dumps({'t': ''})}\n\n"
            else:
                # stream the already-computed answer for a smooth caret effect
                for word in (result_meta["answer"] or "").split(" "):
                    yield f"event: token\ndata: {json.dumps({'t': word + ' '})}\n\n"
            audit.record(db, action="query", actor_user_id=user.user_id,
                         actor_name=user.name, org_id=user.org_id,
                         target_type="answer", target_id=result_meta.get("answer_id"),
                         request_meta={"question": body.question,
                                       "grounded": result_meta["grounded"],
                                       "stream": True})
            payload = {k: result_meta[k] for k in
                       ("answer", "answer_marked", "citations", "confidence",
                        "grounded", "evidence", "latency_ms", "provider", "model",
                        "answer_id", "abstain_reason") if k in result_meta}
            yield f"event: done\ndata: {json.dumps(payload)}\n\n"
        finally:
            db.close()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
