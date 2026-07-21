import { ArrowUpRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import type { Citation, Evidence } from "../lib/types";
import { Badge } from "./ui";

/** Renders answer text, converting [Sn] markers into subtle clickable citation chips. */
export function AnswerBody({
  marked,
  citations,
  evidence,
  onOpen,
}: {
  marked: string;
  citations: Citation[];
  evidence: Evidence[];
  onOpen: (c: Citation) => void;
}) {
  const byId = new Map(citations.map((c) => [c.sid, c]));
  const evById = new Map(evidence.map((e) => [e.sid, e]));
  const parts = marked.split(/(\[S\d+\])/g);
  return (
    <div className="text-[15px] leading-7 text-fg-hi">
      {parts.map((part, i) => {
        const m = part.match(/^\[S(\d+)\]$/);
        if (m) {
          const c = byId.get(Number(m[1]));
          const ev = evById.get(Number(m[1]));
          return (
            <span key={i} className="group relative inline">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => c && onOpen(c)}
                className="mx-0.5 inline-flex h-5 items-center justify-center rounded-full bg-accent/10 px-1.5 text-[11px] font-medium text-accent align-middle transition-colors hover:bg-accent/20"
                title={c ? `${c.doc} §${c.section} p.${c.page}` : part}
              >
                {m[1]}
              </motion.button>
              {ev && (
                <span
                  className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-normal rounded-lg border border-line bg-surface-2 p-3 text-xs leading-5 text-fg-mid shadow-pop opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ maxWidth: "320px" }}
                >
                  <span className="mb-1 block font-mono text-[10px] text-accent">
                    {ev.doc_code} §{ev.section || "-"} p.{ev.page_start}
                  </span>
                  {ev.text.slice(0, 200)}
                  {ev.text.length > 200 ? "…" : ""}
                </span>
              )}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

/** Compact ranked evidence rail for the chat sidebar. */
export function EvidenceRail({
  evidence,
  onOpen,
}: {
  evidence: Evidence[];
  onOpen: (e: Evidence) => void;
}) {
  const max = Math.max(...evidence.map((e) => e.score), 0.0001);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow text-accent">Sources</span>
        <span className="stamp">{evidence.length}</span>
      </div>
      <div className="flex flex-col gap-2 overflow-auto pr-1">
        {evidence.map((e, i) => (
          <motion.button
            key={e.chunk_id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onOpen(e)}
            className="group rounded-lg border border-line bg-surface-1 p-2.5 text-left transition-colors hover:border-accent/30 hover:bg-surface-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-accent">S{e.sid}</span>
              <span className="stamp text-[10px] text-fg-low">{Math.round((e.score / max) * 100)}%</span>
            </div>
            <div className="mt-0.5 truncate text-xs font-medium text-fg-hi">{e.doc_code}</div>
            <div className="truncate text-[10px] text-fg-low">
              §{e.section || "-"} · p.{e.page_start}
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(e.score / max) * 100}%` }}
                transition={{ duration: 0.5, delay: i * 0.04 }}
                className="h-full rounded-full bg-accent"
              />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-fg-mid">{e.text}</p>
            <span className="mt-2 inline-flex items-center gap-1 stamp text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open source <ArrowUpRight className="h-3 w-3" />
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function ConfidenceGauge() {
  return null;
}

export function GroundedStamp() {
  return null;
}
