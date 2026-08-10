export interface Citation {
  sid: number;
  doc: string;
  title: string;
  section: string;
  page: number;
  chunk_id: string;
  superseded: boolean;
  revision: string;
  char_start: number;
  char_end: number;
}

export interface Evidence {
  sid: number;
  chunk_id: string;
  doc_code: string;
  title: string;
  section: string;
  page_start: number;
  text: string;
  score: number;
  superseded: boolean;
}

export interface QueryResult {
  answer: string | null;
  answer_marked?: string | null;
  citations: Citation[];
  confidence: number;
  grounded: boolean;
  evidence: Evidence[];
  latency_ms: number;
  provider: string;
  model: string;
  rewritten_query: string;
  answer_id: string | null;
  abstain_reason?: string | null;
}

export interface DocumentMeta {
  id: string;
  doc_code: string;
  title: string;
  doc_type: string;
  revision: string;
  classification: string;
  unit: string | null;
  collection?: string | null;
  page_count: number;
  status: string;
  created_at: string;
}

export interface SourceResolved {
  doc_id: string;
  doc_code: string;
  title: string;
  revision: string;
  classification: string;
  section: string;
  page_start: number;
  page_end: number;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  text: string;
  superseded: boolean;
  ocr_confidence: number | null;
}

// ---- Reports ---------------------------------------------------------------

export interface ReportSection {
  key: string;
  label: string;
  prompt?: string;
  value: string;
  value_marked?: string;
  citations: Citation[];
  /** The sources couldn't support this section; it is shown as a gap, not prose. */
  unsupported?: boolean;
}

export interface ChartPoint {
  label: string;
  value?: number;
  serviceable?: number;
  total?: number;
  sid?: number;
}

export interface ReportChartSpec {
  type: "bar" | "line" | "pie" | "table";
  title: string;
  /** "records" = from structured data, "documents" = figures read out of the text */
  source: "records" | "documents";
  unit?: string;
  /** Colour the user asked for, applied over the default palette. */
  color?: string;
  series?: string[];
  points?: ChartPoint[];
  columns?: string[];
  rows?: string[][];
  citation_sids?: number[];
}

export interface ReportDraft {
  id: string;
  title: string;
  sections: ReportSection[];
  charts: ReportChartSpec[];
  question?: string;
  depth?: string;
  session_id?: string | null;
  created_at?: string;
}

export interface ReportListItem {
  id: string;
  title: string;
  session_id: string | null;
  created_at: string;
  sections: number;
  sources: number;
}

// ---- Chat ------------------------------------------------------------------

export interface PlanOption {
  id: string;
  label: string;
  recommended?: boolean;
}

export interface PlanQuestion {
  id: string;
  label: string;
  options: PlanOption[];
}

export interface PlanSection {
  key: string;
  label: string;
  prompt?: string;
}

export interface ReportPlan {
  title: string;
  sections: PlanSection[];
  doc_candidates: { doc_id: string; doc_code: string; title: string }[];
  questions: PlanQuestion[];
}

/** A page of a list endpoint. */
export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** One choice offered by a `clarify` turn. `swatch` renders a colour dot. */
export interface ClarifyOption {
  label: string;
  value: string;
  swatch?: string;
}

/** The card a turn resolves to. Mirrors the `done` SSE payload. */
export interface TurnResult {
  kind: "answer" | "plan" | "report" | "text" | "error" | "clarify";
  text?: string;
  suggestions?: string[];
  // answer
  answer?: string | null;
  answer_marked?: string | null;
  grounded?: boolean;
  citations?: Citation[];
  evidence?: Evidence[];
  // plan
  plan?: ReportPlan;
  // clarify — the agent needs one more detail before it can act
  options?: ClarifyOption[];
  // report
  report_id?: string;
  title?: string;
  sections?: ReportSection[];
  charts?: ReportChartSpec[];
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  created_at: string;
}

export interface Me {
  subject: string;
  role: "admin" | "user";
  clearance: number;
  name: string;
  org_id: string;
  classification_banner: string;
}
