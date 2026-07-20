"""Immutable, hash-chained audit log (Impl-Plan §10.3, FR-5.6.1/2/3).

Each row stores hash = H(prev_hash ‖ canonical(event)); any edit/deletion
breaks the chain and is detectable by verify_chain(). Insert-only."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.db.models import AuditEvent


def _canonical(ev: dict) -> str:
    return json.dumps(ev, sort_keys=True, separators=(",", ":"), default=str)


def record(db: Session, *, action: str, actor_user_id: str | None = None,
           actor_name: str = "", org_id: str | None = None,
           target_type: str = "", target_id: str | None = None,
           request_meta: dict | None = None) -> AuditEvent:
    prev = db.execute(
        select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)
    ).scalar_one_or_none()
    prev_hash = prev.hash if prev else ""
    ev = AuditEvent(action=action, actor_user_id=actor_user_id,
                    actor_name=actor_name, org_id=org_id,
                    target_type=target_type, target_id=target_id,
                    request_meta=request_meta or {}, prev_hash=prev_hash)
    body = _canonical({"action": action, "actor_user_id": actor_user_id,
                       "actor_name": actor_name, "org_id": org_id,
                       "target_type": target_type, "target_id": target_id,
                       "request_meta": request_meta or {}})
    ev.hash = hashlib.sha256((prev_hash + "‖" + body).encode()).hexdigest()
    db.add(ev)
    db.commit()
    return ev


def verify_chain(db: Session) -> dict:
    rows = db.execute(select(AuditEvent).order_by(AuditEvent.seq.asc())).scalars().all()
    prev_hash = ""
    for r in rows:
        body = _canonical({"action": r.action, "actor_user_id": r.actor_user_id,
                           "actor_name": r.actor_name, "org_id": r.org_id,
                           "target_type": r.target_type, "target_id": r.target_id,
                           "request_meta": r.request_meta})
        expect = hashlib.sha256((prev_hash + "‖" + body).encode()).hexdigest()
        if r.prev_hash != prev_hash or r.hash != expect:
            return {"valid": False, "broken_at_seq": r.seq, "count": len(rows)}
        prev_hash = r.hash
    return {"valid": True, "count": len(rows)}
