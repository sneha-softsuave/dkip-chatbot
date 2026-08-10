"""System-of-record schema (Impl-Plan §8.1). Postgres holds metadata, chunk
anchors, audit, jobs and answers; vectors live in Qdrant, text in OpenSearch."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Identity,
                        Integer, String, Text)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dkip.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Collection(Base):
    __tablename__ = "collections"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    slug: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")


class DocumentKind(Base):
    __tablename__ = "document_kinds"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    slug: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    subject: Mapped[str] = mapped_column(String, unique=True, index=True)  # keycloak sub or local
    email: Mapped[str] = mapped_column(String, default="")
    display_name: Mapped[str] = mapped_column(String, default="")
    role: Mapped[str] = mapped_column(String, default="user")  # admin | user
    clearance_level: Mapped[int] = mapped_column(Integer, default=1)  # 1..4
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    is_local_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    collection_id: Mapped[str | None] = mapped_column(ForeignKey("collections.id"), nullable=True)
    doc_code: Mapped[str] = mapped_column(String, index=True, default="")  # e.g. OM-VEH-001
    title: Mapped[str] = mapped_column(String)
    doc_type: Mapped[str] = mapped_column(String, default="manual")
    source: Mapped[str] = mapped_column(String, default="upload")  # upload|api|db
    revision: Mapped[str] = mapped_column(String, default="A")
    effective_date: Mapped[str | None] = mapped_column(String, nullable=True)
    unit: Mapped[str | None] = mapped_column(String, nullable=True)
    classification: Mapped[str] = mapped_column(String, default="UNCLASSIFIED")
    clearance_required: Mapped[int] = mapped_column(Integer, default=1)
    access_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    content_hash: Mapped[str] = mapped_column(String, default="", index=True)
    object_key: Mapped[str | None] = mapped_column(String, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="indexed")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    chunks: Mapped[list["Chunk"]] = relationship(back_populates="document",
                                                 cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"))
    ordinal: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    section: Mapped[str] = mapped_column(String, default="")
    page_start: Mapped[int] = mapped_column(Integer, default=1)
    page_end: Mapped[int] = mapped_column(Integer, default=1)
    char_start: Mapped[int] = mapped_column(Integer, default=0)
    char_end: Mapped[int] = mapped_column(Integer, default=0)
    bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {x0,y0,x1,y1}
    revision: Mapped[str] = mapped_column(String, default="A")
    superseded: Mapped[bool] = mapped_column(Boolean, default=False)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    embedding_signature: Mapped[str] = mapped_column(String, default="")

    document: Mapped[Document] = relationship(back_populates="chunks")


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    source: Mapped[str] = mapped_column(String, default="upload")
    trigger: Mapped[str] = mapped_column(String, default="manual")
    status: Mapped[str] = mapped_column(String, default="running")  # running|done|failed
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    files: Mapped[list["IngestionFile"]] = relationship(back_populates="job",
                                                        cascade="all, delete-orphan")


class IngestionFile(Base):
    __tablename__ = "ingestion_files"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("ingestion_jobs.id"))
    filename: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="ok")  # ok|failed|skipped
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    chunks: Mapped[int] = mapped_column(Integer, default=0)
    ocr: Mapped[bool] = mapped_column(Boolean, default=False)
    doc_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)

    job: Mapped[IngestionJob] = relationship(back_populates="files")


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String, default="New session")
    # the report the conversation is currently working on, so "make it shorter"
    # knows what "it" is after a reload
    last_report_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Rolling summary of the turns that have aged out of the rewriter's window,
    # so a long conversation costs the same per turn as a short one.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summarised_upto: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id"))
    role: Mapped[str] = mapped_column(String)  # user|assistant
    content: Mapped[str] = mapped_column(Text)
    # what card this turn rendered: {kind: answer|plan|report|text, plan, report_id,
    # citations, evidence} — replayed verbatim when a session is reopened
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Answer(Base):
    __tablename__ = "answers"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    message_id: Mapped[str | None] = mapped_column(ForeignKey("chat_messages.id"), nullable=True)
    question: Mapped[str] = mapped_column(Text)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    grounded: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    source_chunk_ids: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String, default="")
    model: Mapped[str] = mapped_column(String, default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditEvent(Base):
    """Append-only, hash-chained tamper-evidence (Impl-Plan §10.3)."""
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Identity(), not autoincrement=True: autoincrement only applies to integer
    # PRIMARY KEY columns, and the PK here is the uuid `id`. Postgres must assign
    # seq atomically — computing it in Python would race and let two concurrent
    # events share a seq, breaking both the unique index and the chain ordering.
    seq: Mapped[int] = mapped_column(Integer, Identity(), unique=True, index=True)
    actor_user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    actor_name: Mapped[str] = mapped_column(String, default="")
    action: Mapped[str] = mapped_column(String, index=True)
    target_type: Mapped[str] = mapped_column(String, default="")
    target_id: Mapped[str | None] = mapped_column(String, nullable=True)
    request_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String, default="")
    hash: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ReportTemplate(Base):
    __tablename__ = "report_templates"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    fields: Mapped[list] = mapped_column(JSON, default=list)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    # nullable: reports are normally generated from a conversation-built outline,
    # not from a stored template
    template_id: Mapped[str | None] = mapped_column(
        ForeignKey("report_templates.id"), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, default="")
    # Highest clearance among the documents this report quotes. A report is a
    # derived copy of its sources, so it has to be gated like them — otherwise
    # confidential text becomes readable simply by having been summarised.
    min_clearance: Mapped[int] = mapped_column(Integer, default=1)
    scope: Mapped[dict] = mapped_column(JSON, default=dict)
    draft: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, default="draft")
    exported_object_key: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class StructuredTable(Base):
    __tablename__ = "structured_tables"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String, index=True)
    physical_table: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String, default="upload")
    schema_catalog: Mapped[dict] = mapped_column(JSON, default=dict)


class Connector(Base):
    """API/DB connector configuration (§6.5, §8.1)."""
    __tablename__ = "connectors"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    kind: Mapped[str] = mapped_column(String)  # api | db
    name: Mapped[str] = mapped_column(String, default="")
    config_json: Mapped[dict] = mapped_column(JSON, default=dict)
    secret_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    schedule_cron: Mapped[str | None] = mapped_column(String, nullable=True)
    last_status: Mapped[str | None] = mapped_column(String, nullable=True)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Dashboard(Base):
    """Dashboard definitions (§8.1, §11.3.5)."""
    __tablename__ = "dashboards"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String)
    definition_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
