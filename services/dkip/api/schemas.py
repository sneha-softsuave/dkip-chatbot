"""API contracts (Pydantic v2), mirroring the PRD §9.3 /query contract verbatim."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Scope(BaseModel):
    collections: list[str] | None = None
    doc_ids: list[str] | None = None   # restrict retrieval to specific documents
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


# ---- Admin / Org schemas ---------------------------------------------------

class OrgIn(BaseModel):
    name: str


class CollectionIn(BaseModel):
    slug: str
    name: str
    description: str = ""


class CollectionCreateIn(BaseModel):
    name: str
    description: str = ""


class CollectionUpdateIn(BaseModel):
    name: str | None = None
    description: str | None = None


class DocKindCreateIn(BaseModel):
    name: str


class DocKindUpdateIn(BaseModel):
    name: str | None = None


class UserIn(BaseModel):
    username: str
    password: str
    display_name: str = ""
    role: str = "user"
    clearance: int = 1


class UserPatch(BaseModel):
    display_name: str | None = None
    role: str | None = None
    clearance: int | None = None
    disabled: bool | None = None


# ---- Report schemas --------------------------------------------------------

class ReportTemplateIn(BaseModel):
    name: str
    description: str = ""
    fields: list = []


class ReportField(BaseModel):
    label: str
    value: str = ""
    query: str = ""
    source: str = ""  # "retrieval" or "structured"


class GenerateIn(BaseModel):
    template_id: str
    title: str = ""
    topic: str = ""
    scope: Scope = Field(default_factory=Scope)


class PatchIn(BaseModel):
    draft: dict


# ---- Dashboard schemas -----------------------------------------------------

class DashboardIn(BaseModel):
    name: str
    definition_json: dict = {}


class DashboardDataIn(BaseModel):
    filters: dict = {}


# ---- Connector schemas -----------------------------------------------------

class ConnectorIn(BaseModel):
    kind: str  # api | db
    name: str = ""
    config_json: dict = {}
    secret_ref: str | None = None
    schedule_cron: str | None = None


# ---- Config schemas ---------------------------------------------------------

class ProviderIn(BaseModel):
    provider: str  # cloud | local | fake
