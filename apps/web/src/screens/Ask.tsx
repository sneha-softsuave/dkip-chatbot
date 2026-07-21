import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { AnswerBody } from "../components/answer";
import { GlassPanel } from "../components/GlassPanel";
import { PageTransition } from "../components/PageTransition";
import { SourceViewer, type SourceTarget } from "../components/SourceViewer";
import { Badge, HoloButton, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { streamQuery } from "../lib/stream";
import type { Citation, Evidence, QueryResult } from "../lib/types";

const DOC_TYPES = ["manual", "sop", "record", "engineering"];

interface Turn {
  question: string;
  text: string;
  streaming: boolean;
  result?: QueryResult;
  error?: string;
}

const SUGGESTIONS = [
  "Corrective procedure for hydraulic pressure loss?",
  "Maximum winch line pull on the ARV-5?",
  "Hydraulic under-pressure filter and stock policy?",
];

export function Ask() {
  const [question, setQuestion] = useState("");
  const [collections, setCollections] = useState<Set<string>>(new Set());
  const [docTypes, setDocTypes] = useState<Set<string>>(new Set());
  const [thread, setThread] = useState<Turn[]>([]);
  const [target, setTarget] = useState<SourceTarget | null>(null);
  const sessionId = useRef(crypto.randomUUID());
  const busy = thread.some((t) => t.streaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  const colls = useQuery({ queryKey: ["collections-any"], queryFn: () => api.get("/collections").catch(() => []) });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  function toggle(set: Set<string>, v: string, upd: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    upd(next);
  }

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setQuestion("");
    const idx = thread.length;
    setThread((t) => [...t, { question: q, text: "", streaming: true }]);
    const scope = {
      collections: collections.size ? [...collections] : null,
      doc_types: docTypes.size ? [...docTypes] : null,
    };
    await streamQuery(
      { question: q, scope, session_id: sessionId.current },
      {
        onToken: (tok) =>
          setThread((t) => t.map((turn, i) => (i === idx ? { ...turn, text: turn.text + tok } : turn))),
        onDone: (r) =>
          setThread((t) => t.map((turn, i) => (i === idx ? { ...turn, streaming: false, result: r } : turn))),
        onError: (e) =>
          setThread((t) => t.map((turn, i) => (i === idx ? { ...turn, streaming: false, error: e } : turn))),
      },
    );
  }

  function openCitation(c: Citation) {
    setTarget({ chunkId: c.chunk_id });
  }
  function openEvidence(e: Evidence) {
    setTarget({ chunkId: e.chunk_id });
  }

  const latestEvidence = [...thread].reverse().find((t) => t.result?.evidence?.length)?.result?.evidence;

  return (
    <PageTransition>
      <div className="flex h-full flex-col">
        <PageHeader title="Ask" sub="Query the document library for a cited, source-verified answer" />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col">
            {/* Thread */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-6 overflow-auto pr-1">
              {thread.length === 0 && <EmptyState onPick={ask} />}
              {thread.map((turn, i) => (
                <TurnView key={i} turn={turn} onOpen={openCitation} />
              ))}
            </div>

            {/* Input */}
            <div className="mt-5">
              {/* Scope chips */}
              <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                <span className="stamp text-fg-low">Scope:</span>
                {(colls.data ?? []).map((c: { slug: string; name: string }) => (
                  <button
                    key={c.slug}
                    className={cx("chip text-xs", collections.has(c.slug) && "chip-active")}
                    onClick={() => toggle(collections, c.slug, setCollections)}
                  >
                    {c.name}
                  </button>
                ))}
                <span className="mx-1 h-3 w-px self-center bg-line" />
                {DOC_TYPES.map((d) => (
                  <button
                    key={d}
                    className={cx("chip text-xs capitalize", docTypes.has(d) && "chip-active")}
                    onClick={() => toggle(docTypes, d, setDocTypes)}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <div className="surface-card flex items-end gap-2 p-2 pl-4">
                <textarea
                  className="field max-h-40 min-h-[44px] resize-none border-0 bg-transparent px-0 py-2.5 focus:ring-0"
                  rows={1}
                  value={question}
                  placeholder="Ask anything about your documents…"
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(question);
                    }
                  }}
                />
                <HoloButton disabled={busy || !question.trim()} onClick={() => ask(question)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
                </HoloButton>
              </div>
              <div className="mt-1.5 px-1 text-[10px] text-fg-dim">
                Enter to send · Shift+Enter for newline · Answers are grounded in your document corpus
              </div>
            </div>
          </div>

          {/* Sources rail */}
          <div className="hidden min-h-0 xl:block">
            {latestEvidence ? (
              <SourcesRail evidence={latestEvidence} onOpen={openEvidence} />
            ) : (
              <GlassPanel className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" hover={false}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface">
                  <Search className="h-5 w-5 text-accent" />
                </div>
                <span className="eyebrow text-accent">Sources</span>
                <p className="max-w-[220px] text-xs text-fg-low">Retrieved passages appear here after you ask a question.</p>
              </GlassPanel>
            )}
          </div>

          {target && <SourceViewer target={target} onClose={() => setTarget(null)} />}
        </div>
      </div>
    </PageTransition>
  );
}

function TurnView({ turn, onOpen }: { turn: Turn; onOpen: (c: Citation) => void }) {
  const r = turn.result;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* User message */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-5 py-3 text-sm font-medium text-bg shadow-sm">
          {turn.question}
        </div>
      </div>

      {/* Assistant message */}
      <div className="flex justify-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-surface">
          <Sparkles className="h-4 w-4 text-accent" />
        </div>
        <div className="max-w-[90%] min-w-0">
          <div className="rounded-2xl rounded-bl-md border border-line bg-surface-2 px-5 py-4 shadow-sm">
            {turn.error ? (
              <div className="text-sm text-critical">{turn.error}</div>
            ) : turn.streaming && !r ? (
              <div className="flex items-center gap-2 text-sm text-fg-mid">
                <span>{turn.text}</span>
                <span className="inline-flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0.2s]" />
                </span>
              </div>
            ) : r?.grounded ? (
              <AnswerBody marked={r.answer_marked || r.answer || ""} citations={r.citations} evidence={r.evidence} onOpen={onOpen} />
            ) : (
              <div className="text-sm text-fg-mid">
                I couldn&apos;t find sufficient sources to answer that confidently. Try rephrasing or broadening the scope.
                {r?.abstain_reason && <span className="mt-1 block text-fg-low">Reason: {r.abstain_reason}</span>}
              </div>
            )}
          </div>

          {r?.grounded && (
            <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
              {r.citations.map((c) => (
                <button key={c.chunk_id} onClick={() => onOpen(c)} className="chip hover:border-accent/40">
                  <span className="font-mono text-[10px] text-accent">{c.sid}</span>
                  <span className="text-[10px]">
                    {c.doc} §{c.section} p.{c.page}
                  </span>
                  {c.superseded && <Badge tone="caution">superseded</Badge>}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-fg-dim">
                {r.provider} · {r.latency_ms}ms
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SourcesRail({ evidence, onOpen }: { evidence: Evidence[]; onOpen: (e: Evidence) => void }) {
  const max = Math.max(...evidence.map((e) => e.score), 0.0001);
  return (
    <GlassPanel className="flex h-full flex-col p-4" hover={false}>
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
          </motion.button>
        ))}
      </div>
    </GlassPanel>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 pb-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface">
        <Sparkles className="h-6 w-6 text-accent" />
      </div>
      <h2 className="mt-4 font-sans text-2xl font-bold tracking-tight text-fg-hi">What do you want to know?</h2>
      <p className="mt-1 max-w-md text-sm text-fg-low">Ask a question about your documents. Every answer is cited to section and page.</p>

      <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-line bg-surface-1 px-4 py-2 text-sm text-fg-mid transition-colors hover:border-accent/40 hover:text-fg-hi"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
