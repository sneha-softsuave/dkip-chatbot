"""FastAPI auth dependencies: current_user + require_role (Impl-Plan §10.2)."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from dkip.core.security import decode_token


@dataclass
class Principal:
    subject: str
    role: str          # admin | user
    clearance: int     # 1..4
    name: str
    org_id: str
    user_id: str | None = None


def current_user(request: Request) -> Principal:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    try:
        claims = decode_token(auth.split(" ", 1)[1])
    except Exception:
        raise HTTPException(401, "invalid token")
    return Principal(subject=claims["sub"], role=claims.get("role", "user"),
                     clearance=int(claims.get("clearance", 1)),
                     name=claims.get("name", ""), org_id=claims.get("org_id", ""),
                     user_id=claims.get("uid"))


def require_role(*roles: str):
    def dep(user: Principal = Depends(current_user)) -> Principal:
        if user.role not in roles:
            raise HTTPException(403, f"requires role {roles}")
        return user
    return dep
