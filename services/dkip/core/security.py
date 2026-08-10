"""Auth: local HS256 JWT (guaranteed fallback path, FR-5.1.5) plus optional
Keycloak OIDC validation via JWKS (FR-5.1.5 primary). current_user accepts
either, so a Keycloak outage never blocks the demo."""
from __future__ import annotations

import hashlib
import hmac
import os
import time

import jwt
from jwt import PyJWKClient

from dkip.core.config import settings

# ---- local password hashing (pbkdf2, stdlib only) ---------------------------

def hash_password(password: str, *, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2$200000${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(),
                                 bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# ---- local JWT --------------------------------------------------------------

def issue_local_token(*, subject: str, role: str, clearance: int,
                      name: str, org_id: str, uid: str | None = None) -> str:
    now = int(time.time())
    # `uid` is the users.id row: audit events and anything owned by a user
    # (chat sessions) need the FK, not just the login name.
    payload = {"sub": subject, "role": role, "clearance": clearance,
               "name": name, "org_id": org_id, "uid": uid, "iat": now,
               "exp": now + settings.JWT_TTL_SECONDS, "iss": "dkip-local"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


_jwks_client: PyJWKClient | None = None


def _get_jwks() -> PyJWKClient | None:
    global _jwks_client
    if not settings.KEYCLOAK_JWKS_URL:
        return None
    if _jwks_client is None:
        _jwks_client = PyJWKClient(settings.KEYCLOAK_JWKS_URL)
    return _jwks_client


def decode_token(token: str) -> dict:
    """Return normalized claims {sub, role, clearance, name, org_id, iss}."""
    # 1) local HS256
    try:
        claims = jwt.decode(token, settings.JWT_SECRET,
                            algorithms=[settings.JWT_ALG], options={"verify_aud": False})
        return claims
    except jwt.InvalidTokenError:
        pass
    # 2) Keycloak RS256 via JWKS
    jwks = _get_jwks()
    if jwks is None:
        raise ValueError("invalid token")
    signing_key = jwks.get_signing_key_from_jwt(token).key
    claims = jwt.decode(token, signing_key, algorithms=["RS256"],
                        audience=settings.KEYCLOAK_AUDIENCE,
                        options={"verify_aud": False})
    roles = (claims.get("realm_access", {}) or {}).get("roles", [])
    role = "admin" if "admin" in roles else "user"
    return {"sub": claims["sub"], "role": role,
            "clearance": int(claims.get("clearance", 1)),
            "name": claims.get("preferred_username", claims.get("name", "")),
            "org_id": claims.get("org_id", ""), "iss": claims.get("iss", "")}
