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
    collection: "veh-recovery",
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
    collection: "maintenance",
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
    collection: "veh-recovery",
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
    collection: "veh-recovery",
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
    collection: "maintenance",
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
    collection: "veh-recovery",
    revision: "B",
    classification: "UNCLASSIFIED",
    unit: "12 Corps",
    page_count: 1,
    status: "indexed",
    created_at: "2024-01-10T09:00:00Z",
  },
];

export const docKinds = [
  { slug: "manual", name: "Manual", documents: 2 },
  { slug: "sop", name: "Procedure", documents: 1 },
  { slug: "record", name: "Record", documents: 2 },
  { slug: "engineering", name: "Engineering", documents: 1 },
];

/**
 * Audit trail for the console overview. Fixed timestamps on one day, so the
 * activity chart buckets by hour and the screenshot is stable across runs — a
 * relative "now" would redraw the axis on every capture.
 *
 * 84 questions, 61 of them traced to a source (73%), which is the figure the
 * overview leads with.
 */
const auditShape: { action: string; grounded?: boolean }[] = [
  ...Array.from({ length: 61 }, () => ({ action: "query", grounded: true })),
  ...Array.from({ length: 23 }, () => ({ action: "query", grounded: false })),
  ...Array.from({ length: 18 }, () => ({ action: "login" })),
  ...Array.from({ length: 12 }, () => ({ action: "report_generate" })),
  ...Array.from({ length: 9 }, () => ({ action: "upload" })),
];

export const auditEvents = auditShape.map(({ action, grounded }, i) => {
  // Spread across 09:00-20:00 in a repeatable, uneven pattern, so the chart has
  // a shape rather than a flat line.
  const hour = 9 + ((i * 7) % 12);
  const minute = (i * 13) % 60;
  return {
    seq: 500 - i,
    action,
    actor: ["Maj. A. Rao", "Sgt. V. Kumar", "Cfn. S. Singh"][i % 3],
    target_type: "answer",
    target_id: `a-${i}`,
    meta: grounded === undefined ? {} : { grounded },
    hash: `hash${String(i).padStart(6, "0")}`,
    created_at: `2026-07-23T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+00:00`,
  };
});

export const collections = [
  { slug: "veh-recovery", name: "Vehicle Recovery", description: "Recovery vehicle manuals and records", documents: 4 },
  { slug: "maintenance", name: "Maintenance Logs", description: "Field maintenance and inspection logs", documents: 2 },
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

/** `provider` is the configured setting (cloud | local | fake, per
 *  core/config.py); `active` is the gateway that setting resolved to. */
export const provider = {
  provider: "cloud",
  active: "openai",
  model: "gpt-4o-mini",
  gen_model: "gpt-4o-mini",
  embed_signature: "text-embedding-3-small",
  qdrant_collection: "dkip-chunks",
  needs_reindex: false,
};

/** One of each row state the console can render: you, an administrator, both
 *  access levels, and a disabled account. */
export const users = [
  {
    id: "u1",
    subject: "admin",
    name: "Maj. A. Rao",
    role: "admin",
    clearance: 4,
    disabled: false,
  },
  {
    id: "u2",
    subject: "kumar.v",
    name: "Sgt. V. Kumar",
    role: "user",
    clearance: 4,
    disabled: false,
  },
  {
    id: "u3",
    subject: "singh.k",
    name: "Capt. K. Singh",
    role: "admin",
    clearance: 4,
    disabled: false,
  },
  {
    id: "u4",
    subject: "singh.s",
    name: "Cfn. S. Singh",
    role: "user",
    clearance: 1,
    disabled: false,
  },
  {
    id: "u5",
    subject: "menon.r",
    name: "Lt. R. Menon",
    role: "user",
    clearance: 1,
    disabled: true,
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
