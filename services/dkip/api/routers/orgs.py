"""Org + collection management (§9.2: POST /orgs, POST /orgs/{id}/collections)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.api.schemas import CollectionIn, OrgIn
from dkip.core import audit
from dkip.core.deps import Principal, current_user, require_role
from dkip.db.base import get_db
from dkip.db.models import Collection, Organization

router = APIRouter(tags=["orgs"])


@router.post("/orgs", status_code=201)
def create_org(body: OrgIn,
               user: Principal = Depends(require_role("admin")),
               db: Session = Depends(get_db)):
    org = Organization(name=body.name)
    db.add(org)
    db.flush()
    audit.record(db, action="org_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=org.id, target_type="org",
                 target_id=org.id)
    db.commit()
    return {"id": org.id, "name": org.name, "created_at": org.created_at.isoformat()}


@router.post("/orgs/{org_id}/collections", status_code=201)
def create_collection(org_id: str, body: CollectionIn,
                      user: Principal = Depends(require_role("admin")),
                      db: Session = Depends(get_db)):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "org not found")
    existing = db.execute(
        select(Collection).where(Collection.org_id == org_id,
                                 Collection.slug == body.slug)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "collection slug already exists")
    coll = Collection(org_id=org_id, slug=body.slug, name=body.name,
                      description=body.description)
    db.add(coll)
    db.flush()
    audit.record(db, action="collection_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=org_id, target_type="collection",
                 target_id=coll.id)
    db.commit()
    return {"id": coll.id, "org_id": org_id, "slug": coll.slug,
            "name": coll.name, "description": coll.description}
