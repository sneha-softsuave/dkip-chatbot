"""Admin-managed knowledge areas (collections) and document kinds — the lists
every upload form and filter draw from, instead of a hardcoded option set."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dkip.api.schemas import (CollectionCreateIn, CollectionUpdateIn,
                              DocKindCreateIn, DocKindUpdateIn)
from dkip.core import audit
from dkip.core.deps import Principal, require_role
from dkip.db.base import get_db
from dkip.db.models import Collection, Document, DocumentKind

router = APIRouter(tags=["taxonomy"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "item"


# ---- Knowledge areas (collections) -----------------------------------------

@router.get("/collections")
def list_collections(user: Principal = Depends(require_role("admin", "user")),
                     db: Session = Depends(get_db)):
    counts = dict(db.execute(
        select(Document.collection_id, func.count()).group_by(Document.collection_id)).all())
    rows = db.execute(select(Collection).where(Collection.org_id == user.org_id)).scalars().all()
    return [{"slug": c.slug, "name": c.name, "description": c.description,
             "documents": counts.get(c.id, 0)} for c in rows]


@router.post("/collections", status_code=201)
def create_collection(body: CollectionCreateIn,
                      user: Principal = Depends(require_role("admin")),
                      db: Session = Depends(get_db)):
    slug = _slugify(body.name)
    if db.execute(select(Collection).where(Collection.org_id == user.org_id,
                                           Collection.slug == slug)).scalar_one_or_none():
        raise HTTPException(409, "a knowledge area with this name already exists")
    coll = Collection(org_id=user.org_id, slug=slug, name=body.name, description=body.description)
    db.add(coll)
    db.flush()
    audit.record(db, action="collection_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="collection",
                 target_id=coll.id)
    db.commit()
    return {"slug": coll.slug, "name": coll.name, "description": coll.description, "documents": 0}


@router.patch("/collections/{slug}")
def update_collection(slug: str, body: CollectionUpdateIn,
                      user: Principal = Depends(require_role("admin")),
                      db: Session = Depends(get_db)):
    coll = db.execute(select(Collection).where(Collection.org_id == user.org_id,
                                               Collection.slug == slug)).scalar_one_or_none()
    if not coll:
        raise HTTPException(404, "not found")
    if body.name is not None:
        coll.name = body.name
    if body.description is not None:
        coll.description = body.description
    audit.record(db, action="collection_update", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="collection",
                 target_id=coll.id)
    db.commit()
    count = db.execute(select(func.count()).select_from(Document)
                       .where(Document.collection_id == coll.id)).scalar() or 0
    return {"slug": coll.slug, "name": coll.name, "description": coll.description, "documents": count}


@router.delete("/collections/{slug}", status_code=204)
def delete_collection(slug: str, user: Principal = Depends(require_role("admin")),
                      db: Session = Depends(get_db)):
    coll = db.execute(select(Collection).where(Collection.org_id == user.org_id,
                                               Collection.slug == slug)).scalar_one_or_none()
    if not coll:
        raise HTTPException(404, "not found")
    count = db.execute(select(func.count()).select_from(Document)
                       .where(Document.collection_id == coll.id)).scalar() or 0
    if count:
        raise HTTPException(409, f"{count} document(s) still use this knowledge area")
    db.delete(coll)
    audit.record(db, action="collection_delete", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="collection",
                 target_id=slug)


# ---- Document kinds ----------------------------------------------------------

@router.get("/doc-kinds")
def list_doc_kinds(user: Principal = Depends(require_role("admin", "user")),
                   db: Session = Depends(get_db)):
    counts = dict(db.execute(
        select(Document.doc_type, func.count()).group_by(Document.doc_type)).all())
    rows = db.execute(select(DocumentKind).where(DocumentKind.org_id == user.org_id)).scalars().all()
    return [{"slug": k.slug, "name": k.name, "documents": counts.get(k.slug, 0)} for k in rows]


@router.post("/doc-kinds", status_code=201)
def create_doc_kind(body: DocKindCreateIn, user: Principal = Depends(require_role("admin")),
                    db: Session = Depends(get_db)):
    slug = _slugify(body.name)
    if db.execute(select(DocumentKind).where(DocumentKind.org_id == user.org_id,
                                             DocumentKind.slug == slug)).scalar_one_or_none():
        raise HTTPException(409, "a document kind with this name already exists")
    kind = DocumentKind(org_id=user.org_id, slug=slug, name=body.name)
    db.add(kind)
    db.flush()
    audit.record(db, action="doc_kind_create", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="doc_kind",
                 target_id=kind.id)
    db.commit()
    return {"slug": kind.slug, "name": kind.name, "documents": 0}


@router.patch("/doc-kinds/{slug}")
def update_doc_kind(slug: str, body: DocKindUpdateIn,
                    user: Principal = Depends(require_role("admin")),
                    db: Session = Depends(get_db)):
    kind = db.execute(select(DocumentKind).where(DocumentKind.org_id == user.org_id,
                                                 DocumentKind.slug == slug)).scalar_one_or_none()
    if not kind:
        raise HTTPException(404, "not found")
    if body.name is not None:
        kind.name = body.name
    audit.record(db, action="doc_kind_update", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="doc_kind",
                 target_id=kind.id)
    db.commit()
    count = db.execute(select(func.count()).select_from(Document)
                       .where(Document.doc_type == slug)).scalar() or 0
    return {"slug": kind.slug, "name": kind.name, "documents": count}


@router.delete("/doc-kinds/{slug}", status_code=204)
def delete_doc_kind(slug: str, user: Principal = Depends(require_role("admin")),
                    db: Session = Depends(get_db)):
    kind = db.execute(select(DocumentKind).where(DocumentKind.org_id == user.org_id,
                                                 DocumentKind.slug == slug)).scalar_one_or_none()
    if not kind:
        raise HTTPException(404, "not found")
    count = db.execute(select(func.count()).select_from(Document)
                       .where(Document.doc_type == slug)).scalar() or 0
    if count:
        raise HTTPException(409, f"{count} document(s) still use this kind")
    db.delete(kind)
    audit.record(db, action="doc_kind_delete", actor_user_id=user.user_id,
                 actor_name=user.name, org_id=user.org_id, target_type="doc_kind",
                 target_id=slug)
