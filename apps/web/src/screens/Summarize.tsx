import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { SourceViewer, type SourceTarget } from "../components/SourceViewer";
import { Badge, Panel, cx } from "../components/ui";
import { Header } from "./Sources";
import { api } from "../lib/api";
import type { Citation, DocumentMeta } from "../lib/types";

const FORMATS = ["brief", "detailed", "bullet", "executive"] as const;

export function Summarize() {
  const docs = useQuery<DocumentMeta[]>({ queryKey: ["documents", ""], queryFn: () => api.get("/documents") });
  const [mode, setMode] = useState<"document" | "topic">("document");
  const [docId, setDocId] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("executive");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ summary_marked: string; citations: Citation[]; coverage: number; provider: string } | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<SourceTarget | null>(null);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const body = mode === "document" ? { doc_id: docId, format } : { topic, format };
      setResult(await api.post("/summarize", body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canRun = mode === "document" ? !!docId : topic.trim().length > 2;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div>
        <Header title="Summarize" sub="Condense a document or a topic, cited" />
        <Panel className="p-5">
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(["document", "topic"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx("btn-ghost capitalize", mode === m && "!border-signal/50 !text-signal")}>
                {m}
              </button>
            ))}
          </div>

          {mode === "document" ? (
            <div>
              <label className="stamp mb-1 block text-fg-mid">Document</label>
              <select className="field" value={docId} onChange={(e) => setDocId(e.target.value)}>
                <option value="">Select a document…</option>
                {(docs.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.doc_code} — {d.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="stamp mb-1 block text-fg-mid">Topic</label>
              <input className="field" value={topic} placeholder="e.g. hydraulic pressure remediation"
                onChange={(e) => setTopic(e.target.value)} />
            </div>
          )}

          <div className="mt-4">
            <label className="stamp mb-1 block text-fg-mid">Format</label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button key={f} onClick={() => setFormat(f)} className={cx("chip capitalize", format === f && "chip-active")}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary mt-5 w-full" disabled={!canRun || busy} onClick={run}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Summarizing" : "Generate summary"}
          </button>
          {error && <div className="mt-3 rounded-[3px] border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">{error}</div>}
        </Panel>
      </div>

      <div>
        <Panel className="min-h-[420px] p-6">
          {!result ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center text-fg-low">
              <FileText className="h-8 w-8" />
              <p className="max-w-xs text-sm">Choose a document or topic and generate a cited summary. Every statement traces to a source.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <span className="eyebrow">Cited summary · {format}</span>
                <Badge tone="ok">coverage {Math.round(result.coverage * 100)}%</Badge>
              </div>
              <SummaryText marked={result.summary_marked} citations={result.citations} onOpen={(c) => setTarget({ chunkId: c.chunk_id })} />
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                {result.citations.map((c) => (
                  <button key={c.chunk_id} className="chip hover:border-signal/50" onClick={() => setTarget({ chunkId: c.chunk_id })}>
                    <span className="font-mono text-[11px] text-signal">S{c.sid}</span> {c.doc} §{c.section} p.{c.page}
                  </button>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {target && <SourceViewer target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function SummaryText({ marked, citations, onOpen }: { marked: string; citations: Citation[]; onOpen: (c: Citation) => void }) {
  const byId = new Map(citations.map((c) => [c.sid, c]));
  const parts = marked.split(/(\[S\d+\])/g);
  return (
    <div className="whitespace-pre-wrap text-[15px] leading-7 text-fg-hi">
      {parts.map((part, i) => {
        const m = part.match(/^\[S(\d+)\]$/);
        if (m) {
          const c = byId.get(Number(m[1]));
          return (
            <button key={i} onClick={() => c && onOpen(c)}
              className="mx-0.5 -translate-y-px rounded-[3px] border border-signal/40 bg-signal/10 px-1 align-middle font-mono text-[11px] text-signal hover:bg-signal/20">
              S{m[1]}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}
