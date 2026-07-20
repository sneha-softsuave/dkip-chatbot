import { AlertTriangle, ArrowUpRight, ShieldCheck } from "lucide-react";

import type { Citation, Evidence } from "../lib/types";
import { Badge, Panel, cx } from "./ui";

/** Verdict badge — grounded vs. abstained. Plain status pill, no decoration. */
export function GroundedStamp({ grounded }: { grounded: boolean }) {
  return (
    <div
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        grounded ? "border-ok/40 bg-ok/10 text-ok" : "border-critical/40 bg-critical/10 text-critical",
      )}
    >
      {grounded ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {grounded ? "Grounded" : "Not grounded — abstained"}
    </div>
  );
}

export function ConfidenceGauge({ value }: { value: number }) {
  const tone = value >= 0.7 ? "bg-ok" : value >= 0.45 ? "bg-caution" : "bg-critical";
  return (
    <div className="flex items-center gap-2">
      <span className="stamp text-fg-low">Confidence</span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3" aria-label={`confidence ${Math.round(value * 100)}%`}>
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="font-mono text-xs text-fg-mid">{Math.round(value * 100)}%</span>
    </div>
  );
}

/** Renders answer text, converting [Sn] markers into clickable citation chips. */
export function AnswerBody({
  marked,
  citations,
  onOpen,
}: {
  marked: string;
  citations: Citation[];
  onOpen: (c: Citation) => void;
}) {
  const byId = new Map(citations.map((c) => [c.sid, c]));
  const parts = marked.split(/(\[S\d+\])/g);
  return (
    <p className="text-[15px] leading-7 text-fg-hi">
      {parts.map((part, i) => {
        const m = part.match(/^\[S(\d+)\]$/);
        if (m) {
          const c = byId.get(Number(m[1]));
          return (
            <button
              key={i}
              onClick={() => c && onOpen(c)}
              className="mx-0.5 -translate-y-px rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent align-middle hover:bg-accent/20"
              title={c ? `${c.doc} §${c.section} p.${c.page}` : part}
            >
              {m[1]}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

/** Ranked evidence rail with relevance meters (the S-numbers encode true rank). */
export function EvidenceRail({
  evidence,
  onOpen,
}: {
  evidence: Evidence[];
  onOpen: (e: Evidence) => void;
}) {
  const max = Math.max(...evidence.map((e) => e.score), 0.0001);
  return (
    <Panel className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">Evidence</span>
        <span className="stamp">{evidence.length} sources</span>
      </div>
      <div className="flex flex-col gap-2 overflow-auto pr-1">
        {evidence.map((e) => (
          <button
            key={e.chunk_id}
            onClick={() => onOpen(e)}
            className="group rounded-md border border-line bg-surface-1 p-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-1/70"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-accent">S{e.sid}</span>
              <span className="stamp text-fg-low">{Math.round((e.score / max) * 100)}%</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-mono text-xs text-fg-hi">{e.doc_code}</span>
              {e.superseded && <Badge tone="caution">superseded</Badge>}
            </div>
            <div className="stamp mt-0.5 truncate text-fg-low">
              §{e.section || "-"} · p.{e.page_start}
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent/80" style={{ width: `${(e.score / max) * 100}%` }} />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-fg-mid">{e.text}</p>
            <span className="mt-1 inline-flex items-center gap-1 stamp text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open source <ArrowUpRight className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
