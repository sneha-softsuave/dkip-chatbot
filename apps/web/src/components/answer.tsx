import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Citation, Evidence } from "../lib/types";
import { cx } from "./ui";

/**
 * Answers arrive as Markdown with `[Sn]` citation markers. Rendering them as
 * plain text left `**bold**` and `-` bullets on screen as punctuation.
 *
 * The markers are rewritten into ordinary Markdown links before parsing, so the
 * document structure (lists, emphasis, tables) survives intact and each marker
 * comes back through the link renderer as a citation chip. Splitting the string
 * on markers first — the obvious approach — breaks every list that contains one.
 */
const MARKER = /\[S(\d+)\]/g;

function toMarkdown(marked: string) {
  // Drop the space the model leaves before a marker; the chip carries its own.
  return marked.replace(/[ \t]+(\[S\d+\])/g, "$1").replace(MARKER, "[$1](#cite-$1)");
}

/** Strip markers mid-stream, including a half-arrived one at the tail. */
export function stripPartialMarkers(text: string) {
  return text.replace(/\[S\d*\]?$/, "").replace(MARKER, "");
}

export function AnswerBody({
  marked,
  citations,
  evidence,
  onOpen,
  className,
}: {
  marked: string;
  citations: Citation[];
  evidence: Evidence[];
  onOpen: (c: Citation) => void;
  className?: string;
}) {
  const byId = useMemo(() => new Map(citations.map((c) => [c.sid, c])), [citations]);
  const evById = useMemo(() => new Map(evidence.map((e) => [e.sid, e])), [evidence]);
  const source = useMemo(() => toMarkdown(marked), [marked]);

  return (
    <div className={cx("prose-answer text-prose text-fg-hi", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            const sid = Number(String(href ?? "").replace("#cite-", ""));
            if (!Number.isFinite(sid) || !String(href).startsWith("#cite-")) {
              return <span className="text-accent underline underline-offset-2">{children}</span>;
            }
            const c = byId.get(sid);
            const ev = evById.get(sid);
            return (
              <span className="group relative inline">
                <button
                  onClick={() => c && onOpen(c)}
                  className={cx(
                    "ml-0.5 inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-sm px-1",
                    "align-middle font-mono text-micro transition-colors duration-fast",
                    c?.superseded
                      ? "bg-caution/15 text-caution hover:bg-caution/25"
                      : "bg-surface-3 text-fg-low hover:bg-accent-surface hover:text-accent",
                  )}
                  title={c ? `${c.doc} §${c.section} p.${c.page}${c.superseded ? " — a newer revision exists" : ""}` : undefined}
                >
                  {sid}
                </button>
                {ev && (
                  <span
                    className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-normal rounded-md border border-line-strong bg-surface-3 p-3 text-label leading-5 text-fg-mid opacity-0 shadow-e3 transition-opacity group-hover:opacity-100"
                    style={{ maxWidth: "320px" }}
                  >
                    <span className="mb-1 block font-mono text-micro text-fg-dim">
                      {ev.doc_code} §{ev.section || "-"} p.{ev.page_start}
                    </span>
                    {ev.text.slice(0, 200)}
                    {ev.text.length > 200 ? "…" : ""}
                  </span>
                )}
              </span>
            );
          },
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5 marker:text-fg-dim">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-fg-hi">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h4 className="mb-2 mt-5 text-h2 text-fg-hi first:mt-0">{children}</h4>,
          h2: ({ children }) => <h4 className="mb-2 mt-5 text-h2 text-fg-hi first:mt-0">{children}</h4>,
          h3: ({ children }) => <h4 className="mb-2 mt-5 text-h2 text-fg-hi first:mt-0">{children}</h4>,
          code: ({ children }) => (
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-label text-fg-hi">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-md border border-line bg-surface-1 p-3 text-label">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-line pl-3 text-fg-mid">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-body">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line px-3 py-2 font-medium text-fg-mid">{children}</th>,
          td: ({ children }) => <td className="border-b border-line/60 px-3 py-2">{children}</td>,
          hr: () => <hr className="my-4 border-line" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/** Ranked passages behind an answer, shown inline under the chat turn. */
export function EvidenceRail({
  evidence,
  onOpen,
}: {
  evidence: Evidence[];
  onOpen: (e: Evidence) => void;
}) {
  const max = Math.max(...evidence.map((e) => e.score), 0.0001);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {evidence.map((e, i) => (
        <motion.button
          key={e.chunk_id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          onClick={() => onOpen(e)}
          className="group flex flex-col rounded-md border border-line bg-surface-1 p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-label font-medium text-fg-hi">
              <span className="mr-1.5 font-mono text-micro text-fg-dim">S{e.sid}</span>
              {e.doc_code}
            </span>
            <span className="stamp shrink-0 tabular">{Math.round((e.score / max) * 100)}%</span>
          </div>
          <div className="mt-0.5 truncate text-micro text-fg-dim">
            §{e.section || "-"} · p.{e.page_start}
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(e.score / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.04 }}
              className="h-full rounded-full bg-fg-dim"
            />
          </div>
          <p className="mt-2 line-clamp-2 text-label leading-5 text-fg-mid">{e.text}</p>
          <span className="stamp mt-2 inline-flex items-center gap-1 text-accent opacity-0 transition-opacity group-hover:opacity-100">
            Open source <ArrowUpRight className="h-3 w-3" />
          </span>
        </motion.button>
      ))}
    </div>
  );
}
