"""Model-provider swap (§9.2, FR-5.1.3). Flipping generate/rerank is zero data
change; flipping the embed provider needs a re-index of the corpus (§7.3),
which this endpoint flags rather than silently breaking retrieval."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dkip.core import audit
from dkip.core.config import settings
from dkip.core.deps import Principal, require_role
from dkip.db.base import get_db
from dkip.gateway.factory import make_gateway, reset_gateway
from sqlalchemy.orm import Session

router = APIRouter(tags=["config"])


class ProviderIn(BaseModel):
    provider: str  # cloud | local | fake


@router.get("/config/model-provider")
def get_provider():
    gw = make_gateway()
    return {"provider": settings.MODEL_PROVIDER, "active": gw.provider,
            "gen_model": gw.gen_model, "embed_signature": settings.embed_signature,
            "qdrant_collection": settings.qdrant_collection}


@router.put("/config/model-provider")
def set_provider(body: ProviderIn, user: Principal = Depends(require_role("admin")),
                 db: Session = Depends(get_db)):
    prev = settings.MODEL_PROVIDER
    reindex = settings.embed_signature
    settings.MODEL_PROVIDER = body.provider  # type: ignore[assignment]
    reset_gateway()
    gw = make_gateway()
    needs_reindex = settings.embed_signature != reindex
    audit.record(db, action="config_model_provider", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id,
                 request_meta={"from": prev, "to": body.provider,
                               "needs_reindex": needs_reindex})
    return {"provider": settings.MODEL_PROVIDER, "active": gw.provider,
            "needs_reindex": needs_reindex,
            "note": ("generate/rerank swapped with zero data change; the embed "
                     "signature changed — run the re-index job before querying "
                     f"(new collection {settings.qdrant_collection}).")
                    if needs_reindex else "generate/rerank swapped; no re-index needed."}
