"""API contracts (Pydantic v2), mirroring the PRD §9.3 /query contract verbatim."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Scope(BaseModel):
    collections: list[str] | None = None
    doc_types: list[str] | None = None
    unit: str | None = None
    date_from: str | None = None
    date_to: str | None = None


class QueryIn(BaseModel):
    question: str
    scope: Scope = Field(default_factory=Scope)
    session_id: str | None = None


class Citation(BaseModel):
    sid: int
    doc: str
    title: str = ""
    section: str = ""
    page: int
    chunk_id: str
    superseded: bool = False
    revision: str = "A"


class EvidenceOut(BaseModel):
    sid: int
    chunk_id: str
    doc_code: str
    title: str
    section: str
    page_start: int
    text: str
    score: float
    superseded: bool = False


class QueryOut(BaseModel):
    answer: str | None
    answer_marked: str | None = None  # inline [Sn] markers for the UI pills
    citations: list[Citation] = []
    confidence: float = 0.0
    grounded: bool = False
    # extensions beyond the PRD contract (all additive)
    evidence: list[EvidenceOut] = []
    latency_ms: int = 0
    provider: str = ""
    model: str = ""
    rewritten_query: str = ""
    answer_id: str | None = None
    abstain_reason: str | None = None


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    clearance: int
    name: str


class SummarizeIn(BaseModel):
    doc_id: str | None = None
    topic: str | None = None
    scope: Scope = Field(default_factory=Scope)
    format: str = "brief"
