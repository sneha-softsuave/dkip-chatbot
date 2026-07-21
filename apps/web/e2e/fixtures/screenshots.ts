export const me = {
  subject: "admin",
  role: "admin",
  clearance: 4,
  name: "Maj. A. Rao",
  org_id: "CLR-4",
  classification_banner: "UNCLASSIFIED",
};

export const loginResponse = {
  access_token: "dummy-token",
  token_type: "bearer",
};

export const documents = [
  {
    id: "doc-1",
    doc_code: "OM-VEH-001",
    title: "Operator Manual — ARV-5 (Revision A, superseded)",
    doc_type: "manual",
    revision: "A",
    classification: "UNCLASSIFIED",
    unit: "12 Corps",
    page_count: 1,
    status: "indexed",
    created_at: "2024-01-15T09:00:00Z",
  },
  {
    id: "doc-2",
    doc_code: "SCAN-LOG-4471",
    title: "Field Maintenance Log 4471 (Scanned)",
    doc_type: "record",
    revision: "A",
    classification: "UNCLASSIFIED",
    unit: "12 Corps",
    page_count: 1,
    status: "indexed",
    created_at: "2024-01-14T09:00:00Z",
  },
  {
    id: "doc-3",
    doc_code: "ENG-NOTE-888",
    title: "Engineering Note — Boom Weld Advisory",
    doc_type: "engineering",
    revision: "A",
    classification: "RESTRICTED",
    unit: "12 Corps",
    page_count: 1,
    status: "indexed",
    created_at: "2024-01-13T09:00:00Z",
  },
  {
    id: "doc-4",
    doc_code: "INS-REC-2207",
    title: "Inspection Record — Recovery Fleet Q2",
    doc_type: "record",
    revision: "A",
    classification: "UNCLASSIFIED",
    unit: "12 Corps",
    page_count: 1,
    status: "indexed",
    created_at: "2024-01-12T09:00:00Z",
  },
  {
    id: "doc-5",
    doc_code: "SOP-HYD-014",
    title: "SOP — Hydraulic System Inspection",
    doc_type: "sop",
    revision: "A",
    classification: "UNCLASSIFIED",
    unit: "12 Corps",
    page_count: 1,
    status: "indexed",
    created_at: "2024-01-11T09:00:00Z",
  },
  {
    id: "doc-6",
    doc_code: "OM-VEH-001",
    title: "Operator Manual — 5-Tonne Recovery Vehicle (ARV-5)",
    doc_type: "manual",
    revision: "B",
    classification: "UNCLASSIFIED",
    unit: "12 Corps",
    page_count: 1,
    status: "indexed",
    created_at: "2024-01-10T09:00:00Z",
  },
];

export const auditEvents = [
  {
    seq: 108,
    action: "query",
    actor: "Maj. A. Rao",
    target_type: "answer",
    target_id: "ans-7f2a9c",
    hash: "a3f7c8e2",
    created_at: "2024-01-15T08:00:00Z",
  },
  {
    seq: 107,
    action: "summarize",
    actor: "Maj. A. Rao",
    target_type: "document",
    target_id: "doc-6",
    hash: "b8e1d4a9",
    created_at: "2024-01-15T07:30:00Z",
  },
  {
    seq: 106,
    action: "document_access",
    actor: "Maj. A. Rao",
    target_type: "document",
    target_id: "doc-2",
    hash: "c5a2b1f0",
    created_at: "2024-01-15T07:15:00Z",
  },
  {
    seq: 105,
    action: "login",
    actor: "Maj. A. Rao (Admin)",
    target_type: "session",
    target_id: "sess-aa12",
    hash: "d2e8f5c1",
    created_at: "2024-01-15T07:00:00Z",
  },
  {
    seq: 104,
    action: "report_export",
    actor: "Maj. A. Rao",
    target_type: "report",
    target_id: "rpt-q3",
    hash: "e9b7a3d5",
    created_at: "2024-01-15T06:30:00Z",
  },
  {
    seq: 103,
    action: "upload",
    actor: "Maj. A. Rao",
    target_type: "ingestion_job",
    target_id: "job-8841",
    hash: "f4c6e2b8",
    created_at: "2024-01-15T06:00:00Z",
  },
  {
    seq: 102,
    action: "config_model_provider",
    actor: "Maj. A. Rao",
    target_type: "config",
    target_id: "cfg-provider",
    hash: "g1h9i7j3",
    created_at: "2024-01-15T05:30:00Z",
  },
  {
    seq: 101,
    action: "login",
    actor: "Capt. K. Singh",
    target_type: "session",
    target_id: "sess-9b23",
    hash: "h5k2l8m4",
    created_at: "2024-01-15T05:00:00Z",
  },
];

export const collections = [
  { slug: "veh-recovery", name: "Vehicle Recovery", description: "Recovery vehicle manuals and records" },
  { slug: "maintenance", name: "Maintenance Logs", description: "Field maintenance and inspection logs" },
];

export const health = {
  status: "ok",
  version: "1.0.0",
  components: { db: "ok", search: "ok", llm: "ok" },
  checks: {
    provider: { active: "openai", configured: "openai", gen_model: "gpt-4o-mini", reachable: true },
    qdrant: { reachable: true },
    postgres: { reachable: true },
    redis: { reachable: true },
  },
};

export const provider = {
  provider: "openai",
  model: "gpt-4o-mini",
  gen_model: "gpt-4o-mini",
  embed_signature: "text-embedding-3-small",
  qdrant_collection: "dkip-chunks",
  needs_reindex: false,
};

export const users = [
  {
    id: "u1",
    subject: "admin",
    name: "Maj. A. Rao",
    role: "admin",
    clearance: 4,
    org_id: "CLR-4",
    active: true,
  },
  {
    id: "u2",
    subject: "singh.k",
    name: "Capt. K. Singh",
    role: "user",
    clearance: 2,
    org_id: "CLR-2",
    active: true,
  },
];

export const reportTemplates = [
  {
    id: "tmpl-inspection",
    name: "Fleet Inspection Summary",
    description: "Serviceability status, faults, and recommended actions by unit.",
    fields: [
      { key: "executive_summary", label: "Executive Summary" },
      { key: "serviceability", label: "Serviceability by Equipment" },
      { key: "faults", label: "Outstanding Faults" },
      { key: "recommendations", label: "Recommendations" },
    ],
  },
  {
    id: "tmpl-readiness",
    name: "Mission Readiness Report",
    description: "Mission-capable rate, critical shortages, and risk assessment.",
    fields: [
      { key: "readiness_rate", label: "Readiness Rate" },
      { key: "critical_gaps", label: "Critical Gaps" },
      { key: "risk_assessment", label: "Risk Assessment" },
    ],
  },
];

export const ingestionJobs = [
  {
    id: "job-8841",
    status: "done",
    source: "batch-upload",
    summary: { ok: 6, failed: 0, skipped: 0 },
  },
  {
    id: "job-7720",
    status: "running",
    source: "ocr-pdf",
    summary: { ok: 2, failed: 1, skipped: 0 },
  },
];

export const fleetDashboard = {
  kpi: { s: 22, u: 2, a: 3, t: 27 },
  by_equipment: [
    { equipment: "ARV-5", serviceable: 7, total: 8 },
    { equipment: "5T Truck", serviceable: 6, total: 7 },
    { equipment: "Light Crane", serviceable: 3, total: 4 },
    { equipment: "Field Ambulance", serviceable: 6, total: 8 },
  ],
  by_unit: [
    { unit: "12 Corps", serviceable: 18, total: 22 },
    { unit: "3 Bde", serviceable: 4, total: 5 },
  ],
};
