import { useQuery } from "@tanstack/react-query";
import { Copy, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

import { SourceViewer, type SourceTarget } from "../components/SourceViewer";
import { GlassPanel } from "../components/GlassPanel";
import { PageTransition } from "../components/PageTransition";
import { Badge, HoloButton, InputField, PageHeader, Select, cx } from "../components/ui";
import { api } from "../lib/api";
import type { Citation, DocumentMeta } from "../lib/types";

const FORMATS = ["brief", "detailed", "bullet", "executive"] as const;

export function Summarize() {
  const docs = useQuery<DocumentMeta[]>({ queryKey: ["documents", ""], queryFn: () => api.get("/documents") });
  const [mode, setMode] = useState<"document" | "topic">("document");
  const [docId, setDocId] = useState("");
  const [topic, setTopic] = useState("");
  const [scopeUnit, setScopeUnit] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("executive");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ summary_marked: string; summary: string; citations: Citation[]; coverage: number; provider: string } | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<SourceTarget | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const scope: any = {};
      if (scopeUnit) scope.unit = scopeUnit;
      const body = mode === "document" ? { doc_id: docId, format, scope } : { topic, format, scope };
      setResult(await api.post("/summarize", body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard() {
    if (!result?.summary) return;
    await navigator.clipboard.writeText(result.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function exportText() {
    if (!result?.summary) return;
    const blob = new Blob([result.summary], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary-${mode}-${format}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canRun = mode === "document" ? !!docId : topic.trim().length > 2;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Summarize" sub="Generate a cited summary from a document or a topic" />
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <GlassPanel className="p-5" hover={false}>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {(["document", "topic"] as const).map((m) => (
                  <motion.button
                    key={m}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setMode(m)}
                    className={cx(
                      "btn-ghost capitalize",
                      mode === m && "!border-accent/50 !bg-accent-surface !text-fg-hi",
                    )}
                  >
                    {m}
                  </motion.button>
                ))}
              </div>

              {mode === "document" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-mid">Document</label>
                  <Select value={docId} onChange={(e) => setDocId(e.target.value)}>
                    <option value="">Select a document…</option>
                    {(docs.data ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.doc_code} — {d.title}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-mid">Topic</label>
                  <InputField value={topic} placeholder="e.g. hydraulic pressure remediation" onChange={(e) => setTopic(e.target.value)} />
                </div>
              )}

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-fg-mid">Scope unit (optional)</label>
                <InputField value={scopeUnit} placeholder="e.g. 12 Corps" onChange={(e) => setScopeUnit(e.target.value)} />
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-fg-mid">Format</label>
                <div className="flex flex-wrap gap-2">
                  {FORMATS.map((f) => (
                    <button key={f} onClick={() => setFormat(f)} className={cx("chip capitalize", format === f && "chip-active")}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <HoloButton className="mt-5 w-full" disabled={!canRun || busy} onClick={run}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Generating…" : "Generate summary"}
              </HoloButton>
              {error && <div className="mt-3 rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">{error}</div>}
            </GlassPanel>
          </div>

          <div>
            <GlassPanel className="min-h-[420px] p-6" hover={false}>
              {!result ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center text-fg-low">
                  <FileText className="h-8 w-8" />
                  <p className="max-w-xs text-sm">Choose a document or topic and generate a cited summary. Every statement traces to a source.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <span className="eyebrow text-accent">Summary · {format}</span>
                    <div className="flex items-center gap-2">
                      <HoloButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={copyToClipboard} title="Copy to clipboard">
                        <Copy className="mr-1 inline h-3 w-3" /> {copied ? "Copied!" : "Copy"}
                      </HoloButton>
                      <HoloButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={exportText} title="Download as text">
                        <Download className="mr-1 inline h-3 w-3" /> Export
                      </HoloButton>
                      <Badge tone="ok">coverage {Math.round(result.coverage * 100)}%</Badge>
                    </div>
                  </div>
                  <SummaryText marked={result.summary_marked} citations={result.citations} onOpen={(c) => setTarget({ chunkId: c.chunk_id })} />
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                    {result.citations.map((c) => (
                      <button key={c.chunk_id} className="chip hover:border-accent/40" onClick={() => setTarget({ chunkId: c.chunk_id })}>
                        <span className="font-mono text-[11px] text-accent">{c.sid}</span> {c.doc} §{c.section} p.{c.page}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </GlassPanel>
          </div>

          {target && <SourceViewer target={target} onClose={() => setTarget(null)} />}
        </div>
      </div>
    </PageTransition>
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
            <motion.button
              key={i}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => c && onOpen(c)}
              className="mx-0.5 -translate-y-px rounded-md border border-accent/50 bg-accent-surface px-1.5 py-0.5 align-middle font-mono text-[11px] text-accent transition-colors hover:bg-accent/20"
            >
              {m[1]}
            </motion.button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}
