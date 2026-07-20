import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Info, Radar, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";

import { AnswerBody, ConfidenceGauge, EvidenceRail, GroundedStamp } from "../components/answer";
import { SourceViewer, type SourceTarget } from "../components/SourceViewer";
import { Badge, Panel, cx } from "../components/ui";
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
  "What is the maximum winch line pull on the ARV-5?",
  "Which filter is used for hydraulic under-pressure and its stock policy?",
];

export function Ask() {
  const [question, setQuestion] = useState("");
  const [collections, setCollections] = useState<Set<string>>(new Set());
  const [docTypes, setDocTypes] = useState<Set<string>>(new Set());
  const [thread, setThread] = useState<Turn[]>([]);
  const [target, setTarget] = useState<SourceTarget | null>(null);
  const sessionId = useRef(crypto.randomUUID());
  const busy = thread.some((t) => t.streaming);

  const colls = useQuery({ queryKey: ["collections-any"], queryFn: () => api.get("/collections").catch(() => []) });

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

  const latest = [...thread].reverse().find((t) => t.result?.grounded)?.result;

  return (
    <div className="grid h-full grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-0 flex-col">
        {/* Scope bar */}
        <Panel className="mb-4 p-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-signal" />
            <span className="eyebrow">Query scope</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(colls.data ?? []).map((c: { slug: string; name: string }) => (
              <button key={c.slug} className={cx("chip", collections.has(c.slug) && "chip-active")}
                onClick={() => toggle(collections, c.slug, setCollections)}>
                {c.name}
              </button>
            ))}
            <span className="mx-1 w-px self-stretch bg-line" />
            {DOC_TYPES.map((d) => (
              <button key={d} className={cx("chip uppercase", docTypes.has(d) && "chip-active")}
                onClick={() => toggle(docTypes, d, setDocTypes)}>
                {d}
              </button>
            ))}
          </div>
        </Panel>

        {/* Thread */}
        <div className="min-h-0 flex-1 space-y-5 overflow-auto pr-1">
          {thread.length === 0 && <EmptyState onPick={ask} />}
          {thread.map((turn, i) => (
            <TurnView key={i} turn={turn} onOpen={openCitation} />
          ))}
        </div>

        {/* Input */}
        <div className="mt-4">
          <Panel className="flex items-end gap-3 p-3" glow={busy}>
            <Radar className={cx("mb-2 h-5 w-5 shrink-0", busy ? "animate-spin text-signal" : "text-fg-low")} />
            <textarea
              className="field max-h-40 min-h-[44px] resize-none border-0 bg-transparent focus:ring-0"
              rows={1}
              value={question}
              placeholder="Ask a grounded question over the corpus…"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
            />
            <button className="btn-primary mb-1" disabled={busy || !question.trim()} onClick={() => ask(question)}>
              Ask <CornerDownLeft className="h-4 w-4" />
            </button>
          </Panel>
          <div className="mt-1.5 flex items-center gap-2 px-1">
            <Info className="h-3 w-3 text-fg-low" />
            <span className="stamp text-fg-low">Answers are composed only from retrieved sources · Enter to send · Shift+Enter for newline</span>
          </div>
        </div>
      </div>

      {/* Evidence rail (latest grounded answer) */}
      <div className="hidden min-h-0 xl:block">
        {latest ? (
          <EvidenceRail evidence={latest.evidence} onOpen={openEvidence} />
        ) : (
          <Panel className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Radar className="h-7 w-7 text-fg-low" />
            <span className="eyebrow">Evidence</span>
            <p className="text-xs text-fg-low">Retrieved source passages appear here, ranked by relevance.</p>
          </Panel>
        )}
      </div>

      {target && <SourceViewer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function TurnView({ turn, onOpen }: { turn: Turn; onOpen: (c: Citation) => void }) {
  const r = turn.result;
  return (
    <div className="animate-rise space-y-3">
      {/* question */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[3px] rounded-br-none border border-line bg-surface-2 px-4 py-2 text-sm text-fg-hi">
          {turn.question}
        </div>
      </div>

      {/* answer */}
      <Panel className="p-5">
        {turn.error ? (
          <div className="text-sm text-critical">Error: {turn.error}</div>
        ) : turn.streaming && !r ? (
          <p className="text-[15px] leading-7 text-fg-mid">
            {turn.text}
            <span className="ml-0.5 inline-block h-4 w-2 animate-caret bg-signal align-middle" />
          </p>
        ) : r?.grounded ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <GroundedStamp grounded />
              <div className="flex items-center gap-4">
                <ConfidenceGauge value={r.confidence} />
              </div>
            </div>
            <AnswerBody marked={r.answer_marked || r.answer || ""} citations={r.citations} onOpen={onOpen} />
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {r.citations.map((c) => (
                <button key={c.chunk_id} onClick={() => onOpen(c)}
                  className="chip hover:border-signal/50">
                  <span className="font-mono text-[11px] text-signal">S{c.sid}</span>
                  {c.doc} §{c.section} p.{c.page}
                  {c.superseded && <Badge tone="caution">superseded</Badge>}
                </button>
              ))}
              <span className="ml-auto stamp text-fg-low">
                {r.provider} · {r.model} · {r.latency_ms}ms
              </span>
            </div>
          </>
        ) : (
          <AbstainCard reason={r?.abstain_reason} provider={r?.provider} latency={r?.latency_ms} />
        )}
      </Panel>
    </div>
  );
}

function AbstainCard({ reason, provider, latency }: { reason?: string | null; provider?: string; latency?: number }) {
  return (
    <div className="rounded-[3px] border border-critical/40 bg-critical/5 p-5">
      <div className="mb-3">
        <GroundedStamp grounded={false} />
      </div>
      <h3 className="font-display text-lg font-semibold text-fg-hi">Insufficient sources in the corpus</h3>
      <p className="mt-1 max-w-xl text-sm leading-6 text-fg-mid">
        The retrieval did not surface passages that support a grounded answer, so the system abstains rather
        than guessing. Try broadening the scope, or confirm the topic exists in the corpus.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Badge tone="critical">grounded: false</Badge>
        {reason && <span className="stamp text-fg-low">reason: {reason}</span>}
        <span className="ml-auto stamp text-fg-low">{provider} · {latency}ms</span>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <Panel className="animate-rise p-8">
      <span className="eyebrow">Grounded Q&amp;A</span>
      <h2 className="mt-2 font-display text-2xl font-bold text-fg-hi">Ask the corpus a question</h2>
      <p className="mt-1 max-w-xl text-sm leading-6 text-fg-mid">
        Every answer is retrieved from your documents, reranked for relevance, and cited to the exact
        section and page. Try one of these against the demonstration corpus:
      </p>
      <div className="mt-4 grid gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onPick(s)}
            className="flex items-center justify-between rounded-[3px] border border-line bg-surface-2/50 px-4 py-2.5 text-left text-sm text-fg-mid transition-colors hover:border-signal/40 hover:text-fg-hi">
            {s}
            <CornerDownLeft className="h-3.5 w-3.5 text-fg-low" />
          </button>
        ))}
      </div>
    </Panel>
  );
}
