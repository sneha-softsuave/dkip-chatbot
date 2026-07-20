"""Admin console routes (§9.2): user + role management (minimal for POC)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core import audit
from dkip.core.deps import Principal, require_role
from dkip.core.security import hash_password
from dkip.db.base import get_db
from dkip.db.models import User

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
