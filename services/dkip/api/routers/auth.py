"""Auth routes (§9.2). Local-account fallback (FR-5.1.5) + current-user."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.api.schemas import LoginIn, TokenOut
from dkip.core import audit
from dkip.core.config import settings
from dkip.core.deps import Principal, current_user
from dkip.core.security import issue_local_token, verify_password
from dkip.db.base import get_db
from dkip.db.models import User

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.subject == body.username)
                      ).scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "invalid credentials")
    if user.disabled_at:
        raise HTTPException(403, "account disabled")
    token = issue_local_token(subject=user.subject, role=user.role,
                              clearance=user.clearance_level,
                              name=user.display_name, org_id=user.org_id,
                              uid=user.id)
    audit.record(db, action="login", actor_user_id=user.id,
                 actor_name=user.display_name, org_id=user.org_id,
                 request_meta={"method": "local", "ip": request.client.host if request.client else ""})
    return TokenOut(access_token=token, role=user.role,
                    clearance=user.clearance_level, name=user.display_name)


@router.get("/auth/me")
def me(user: Principal = Depends(current_user)):
    return {"subject": user.subject, "role": user.role, "clearance": user.clearance,
            "name": user.name, "org_id": user.org_id,
            "classification_banner": settings.CLASSIFICATION_BANNER}
