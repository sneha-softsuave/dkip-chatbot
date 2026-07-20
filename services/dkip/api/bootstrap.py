"""Startup bootstrap: create tables + stores and seed the demo org, two roles,
local-fallback users, collections, and one report template.

ponytail: Base.metadata.create_all instead of Alembic migrations — fine for a
single-version POC; add Alembic when the schema starts evolving in prod."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from dkip.core.config import settings
from dkip.core.security import hash_password
from dkip.db.base import Base, SessionLocal, engine
from dkip.db.models import (Collection, Organization, ReportTemplate, User)
from dkip.stores import objects, opensearch_store, qdrant_store

DEMO_ORG = "Corps of EME — Demonstration Command"

SEED_COLLECTIONS = [
    ("veh-recovery", "Vehicle Recovery", "Recovery vehicle manuals, SOPs, records"),
    ("hydraulics", "Hydraulic Systems", "Hydraulic maintenance and inspection"),
    ("logistics", "Logistics & Spares", "Spares, stock and fleet status"),
]

# username, password, role, clearance, name
SEED_USERS = [
    ("admin", "admin123", "admin", 4, "Maj. A. Rao (Admin)"),
    ("analyst", "analyst123", "user", 2, "Sgt. V. Kumar (Analyst)"),
    ("operator", "operator123", "user", 1, "Cfn. S. Singh (Operator)"),
]


def init_stores() -> None:
    Base.metadata.create_all(engine)
    for fn in (objects.ensure_buckets, qdrant_store.ensure_collection,
               opensearch_store.ensure_index):
        try:
            fn()
        except Exception as e:  # noqa: BLE001 — surfaced at /health, don't crash boot
            print(f"[bootstrap] {fn.__name__} deferred: {e}")


def seed_identity() -> str:
    db: Session = SessionLocal()
    try:
        org = db.execute(select(Organization)).scalars().first()
        if org is None:
            org = Organization(name=DEMO_ORG)
            db.add(org); db.flush()
        for slug, name, desc in SEED_COLLECTIONS:
            if not db.execute(select(Collection).where(Collection.slug == slug)
                              ).scalar_one_or_none():
                db.add(Collection(org_id=org.id, slug=slug, name=name, description=desc))
        for username, pw, role, clearance, name in SEED_USERS:
            if not db.execute(select(User).where(User.subject == username)
                              ).scalar_one_or_none():
                db.add(User(org_id=org.id, subject=username, email=f"{username}@demo.mil",
                            display_name=name, role=role, clearance_level=clearance,
                            password_hash=hash_password(pw), is_local_fallback=True))
        if not db.execute(select(ReportTemplate)).scalars().first():
            db.add(ReportTemplate(org_id=org.id, name="Inspection Digest",
                description="Fleet inspection digest with cited findings",
                fields=[{"key": "summary", "label": "Executive Summary", "type": "retrieval"},
                        {"key": "findings", "label": "Key Findings", "type": "retrieval"},
                        {"key": "serviceable", "label": "Serviceable Count", "type": "metric"}]))
        db.commit()
        return org.id
    finally:
        db.close()
