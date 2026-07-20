export interface Citation {
  sid: number;
  doc: string;
  title: string;
  section: string;
  page: number;
  chunk_id: string;
  superseded: boolean;
  revision: string;
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

export interface Me {
  subject: string;
  role: "admin" | "user";
  clearance: number;
  name: string;
  org_id: string;
  classification_banner: string;
}
