"""Summarization route (§9.2, FR-5.4.1)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dkip.api.schemas import SummarizeIn
from dkip.core import audit
from dkip.core.deps import Principal, current_user
from dkip.db.base import get_db
from dkip.rag import summarize as summ

router = APIRouter(tags=["summarize"])


@router.post("/summarize")
def summarize(body: SummarizeIn, user: Principal = Depends(current_user),
              db: Session = Depends(get_db)):
    if not body.doc_id and not body.topic:
        raise HTTPException(422, "provide doc_id or topic")
    try:
        if body.doc_id:
            result = summ.summarize_document(db, doc_id=body.doc_id,
                                             fmt=body.format, user=user)
        else:
            result = summ.summarize_topic(db, topic=body.topic,
                                          scope=body.scope.model_dump(),
                                          fmt=body.format, user=user)
    except PermissionError:
        raise HTTPException(403, "above clearance")
    except ValueError as e:
        raise HTTPException(404, str(e))
    audit.record(db, action="summarize", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id,
                 target_type="document" if body.doc_id else "topic",
                 target_id=body.doc_id, request_meta={"format": body.format})
    return result
