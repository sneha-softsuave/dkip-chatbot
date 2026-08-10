"""Startup bootstrap: create tables + stores and seed the demo org, two roles,
local-fallback users, collections, and one report template.

ponytail: Base.metadata.create_all instead of Alembic migrations — fine for a
single-version POC; add Alembic when the schema starts evolving in prod."""
from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from dkip.core.config import settings
from dkip.core.security import hash_password
from dkip.db.base import Base, SessionLocal, engine
from dkip.db.models import (Collection, DocumentKind, Organization, ReportTemplate, User)
from dkip.stores import objects, opensearch_store, qdrant_store

DEMO_ORG = "Corps of EME — Demonstration Command"

SEED_COLLECTIONS = [
    ("veh-recovery", "Vehicle Recovery", "Recovery vehicle manuals, SOPs, records"),
    ("hydraulics", "Hydraulic Systems", "Hydraulic maintenance and inspection"),
    ("logistics", "Logistics & Spares", "Spares, stock and fleet status"),
]

SEED_DOC_KINDS = [
    ("manual", "Manual"),
    ("sop", "Procedure"),
    ("record", "Record"),
    ("engineering", "Engineering"),
]

# username, password, role, clearance, name
# Each account demonstrates one thing: the analyst reads everything but cannot
# upload, which is what makes role and clearance visibly independent axes.
SEED_USERS = [
    ("admin", "admin123", "admin", 4, "Maj. A. Rao (Admin)"),
    ("analyst", "analyst123", "user", 4, "Sgt. V. Kumar (Analyst)"),
    ("operator", "operator123", "user", 1, "Cfn. S. Singh (Operator)"),
]


# create_all adds new tables but never alters existing ones. These are the
# column changes made after the first release; each is idempotent, so this stays
# correct on a fresh DB and on one seeded by an earlier build.
_SCHEMA_PATCHES = [
    "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS meta JSON DEFAULT '{}'",
    "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS last_report_id VARCHAR",
    "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary TEXT",
    "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summarised_upto INTEGER DEFAULT 0",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS session_id VARCHAR",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS min_clearance INTEGER DEFAULT 1",
    "ALTER TABLE reports ALTER COLUMN template_id DROP NOT NULL",
]


def init_stores() -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for sql in _SCHEMA_PATCHES:
            try:
                conn.execute(text(sql))
            except Exception as e:  # noqa: BLE001 — already applied, or not Postgres
                print(f"[bootstrap] schema patch skipped ({e}): {sql}")
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
        for slug, name in SEED_DOC_KINDS:
            if not db.execute(select(DocumentKind).where(DocumentKind.slug == slug)
                              ).scalar_one_or_none():
                db.add(DocumentKind(org_id=org.id, slug=slug, name=name))
        for username, pw, role, clearance, name in SEED_USERS:
            existing = db.execute(select(User).where(User.subject == username)
                                  ).scalar_one_or_none()
            if existing is None:
                db.add(User(org_id=org.id, subject=username, email=f"{username}@demo.mil",
                            display_name=name, role=role, clearance_level=clearance,
                            password_hash=hash_password(pw), is_local_fallback=True))
                continue
            # These three are fixtures, not accounts anyone owns. Reconcile them
            # with the table above: without this, editing SEED_USERS has no effect
            # on a database seeded by an earlier build, and the demo account
            # silently disagrees with the code and the documentation. Password and
            # disabled state are left alone — those are operator decisions.
            existing.role = role
            existing.clearance_level = clearance
            existing.display_name = name
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
