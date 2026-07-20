"""Audit routes (§9.2, §10.3, FR-5.6.1/2/3): search, export, chain-verify, and
per-answer source re-verification."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core import audit as audit_mod
from dkip.core.deps import Principal, require_role
from dkip.db.base import get_db
from dkip.db.models import Answer, AuditEvent, Chunk, Document

router = APIRouter(tags=["audit"])


@router.get("/audit")
def search(action: str | None = None, actor: str | None = None,
           limit: int = 100, user: Principal = Depends(require_role("admin")),
           db: Session = Depends(get_db)):
    q = select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(limit)
    if action:
        q = q.where(AuditEvent.action == action)
    rows = db.execute(q).scalars().all()
    if actor:
        rows = [r for r in rows if actor.lower() in (r.actor_name or "").lower()]
    return [{"seq": r.seq, "action": r.action, "actor": r.actor_name,
             "target_type": r.target_type, "target_id": r.target_id,
             "meta": r.request_meta, "hash": r.hash[:12],
             "created_at": r.created_at.isoformat()} for r in rows]


@router.get("/audit/verify")
def verify(user: Principal = Depends(require_role("admin")),
           db: Session = Depends(get_db)):
    return audit_mod.verify_chain(db)


@router.get("/audit/export")
def export(user: Principal = Depends(require_role("admin")),
           db: Session = Depends(get_db)):
    rows = db.execute(select(AuditEvent).order_by(AuditEvent.seq.asc())).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["seq", "action", "actor", "target_type", "target_id", "hash", "created_at"])
    for r in rows:
        w.writerow([r.seq, r.action, r.actor_name, r.target_type, r.target_id,
                    r.hash, r.created_at.isoformat()])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=dkip-audit.csv"})


@router.get("/answers/{answer_id}/verify")
def verify_answer(answer_id: str, user: Principal = Depends(require_role("admin")),
                  db: Session = Depends(get_db)):
    """Re-resolve the exact chunks an answer used (FR-5.6.3)."""
    ans = db.get(Answer, answer_id)
    if not ans:
        raise HTTPException(404, "not found")
    sources = []
    for cid in ans.source_chunk_ids:
        c = db.get(Chunk, cid)
        if not c:
            sources.append({"chunk_id": cid, "resolved": False}); continue
        d = db.get(Document, c.document_id)
        sources.append({"chunk_id": cid, "resolved": True,
                        "doc": d.doc_code if d else "", "section": c.section,
                        "page": c.page_start, "text": c.text[:400]})
    return {"answer_id": ans.id, "question": ans.question,
            "answer": ans.answer_text, "grounded": ans.grounded,
            "provider": ans.provider, "model": ans.model, "sources": sources}
