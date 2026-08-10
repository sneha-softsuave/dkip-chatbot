"""Admin console routes (§9.2): user + role management (minimal for POC)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from dkip.core import audit
from dkip.core.deps import Principal, require_role
from dkip.core.security import hash_password
from dkip.db.base import get_db
from dkip.db.models import (Answer, ChatMessage, ChatSession, Document, User)

router = APIRouter(tags=["admin"])


class UserIn(BaseModel):
    username: str
    password: str
    display_name: str = ""
    role: str = "user"
    clearance: int = 1


class UserPatch(BaseModel):
    display_name: str | None = None
    role: str | None = None
    clearance: int | None = None
    disabled: bool | None = None


@router.get("/users")
def list_users(user: Principal = Depends(require_role("admin")),
               db: Session = Depends(get_db)):
    rows = db.execute(select(User)).scalars().all()
    return [{"subject": u.subject, "name": u.display_name, "role": u.role,
             "clearance": u.clearance_level, "disabled": bool(u.disabled_at)}
            for u in rows]


@router.post("/users", status_code=201)
def create_user(body: UserIn, user: Principal = Depends(require_role("admin")),
                db: Session = Depends(get_db)):
    if db.execute(select(User).where(User.subject == body.username)).scalar_one_or_none():
        raise HTTPException(409, "user exists")
    u = User(org_id=user.org_id, subject=body.username, display_name=body.display_name,
             role=body.role, clearance_level=body.clearance,
             password_hash=hash_password(body.password), is_local_fallback=True)
    db.add(u)
    audit.record(db, action="user_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="user",
                 target_id=body.username)
    return {"subject": u.subject, "role": u.role, "clearance": u.clearance_level}


@router.patch("/users/{username}")
def update_user(username: str, body: UserPatch, user: Principal = Depends(require_role("admin")),
                db: Session = Depends(get_db)):
    u = db.execute(select(User).where(User.subject == username)).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "user not found")
    if body.display_name:
        u.display_name = body.display_name
    if body.role:
        u.role = body.role
    if body.clearance is not None:
        u.clearance_level = body.clearance
    if body.disabled is not None:
        from datetime import datetime, timezone
        u.disabled_at = datetime.now(timezone.utc) if body.disabled else None
    db.commit()
    audit.record(db, action="user_update", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="user",
                 target_id=username)
    return {"subject": u.subject, "role": u.role, "clearance": u.clearance_level,
            "disabled": bool(u.disabled_at)}


@router.delete("/users/{username}", status_code=204)
def delete_user(username: str, user: Principal = Depends(require_role("admin")),
                db: Session = Depends(get_db)):
    """Remove an account and everything private to it.

    Disabling only blocks sign-in; the rows stay. This actually removes the
    account, so it takes the conversations with it — a chat is private to the
    person who had it, and leaving orphaned ones behind would be both a dangling
    FK and a pile of unreachable transcripts.

    The audit trail is deliberately untouched: `audit_events.actor_user_id` is a
    plain column, not a foreign key, precisely so an append-only hash-chained log
    survives the deletion of the actor. Rewriting it to tidy up would break the
    chain, which is the one thing it exists to prevent."""
    u = db.execute(select(User).where(User.subject == username)).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "user not found")
    if u.subject == user.subject:
        raise HTTPException(400, "cannot delete the account you are signed in as")

    sessions = db.execute(select(ChatSession).where(ChatSession.user_id == u.id)
                          ).scalars().all()
    for s in sessions:
        msgs = db.execute(select(ChatMessage).where(ChatMessage.session_id == s.id)
                          ).scalars().all()
        for m in msgs:
            # answers.message_id is nullable and the answer is corpus-level
            # evidence of what was asked, not private content — keep it, unlink it.
            db.execute(update(Answer).where(Answer.message_id == m.id)
                       .values(message_id=None))
            db.delete(m)
        db.delete(s)
    # Uploaded documents outlive whoever uploaded them.
    db.execute(update(Document).where(Document.created_by == u.id)
               .values(created_by=None))
    db.delete(u)
    audit.record(db, action="user_delete", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="user",
                 target_id=username,
                 request_meta={"conversations_removed": len(sessions)})
    db.commit()
