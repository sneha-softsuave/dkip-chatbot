import { useQuery } from "@tanstack/react-query";
import { Download, FileCheck2, Fingerprint, ShieldCheck, ShieldX, X } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

import { GlassPanel } from "../components/GlassPanel";
import { PageTransition } from "../components/PageTransition";
import { Badge, HoloButton, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";

const ACTIONS = ["", "query", "summarize", "document_access", "login", "upload", "report_export", "config_model_provider"];

export function Audit() {
  const [action, setAction] = useState("");
  const [chain, setChain] = useState<{ valid: boolean; count: number } | null>(null);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const events = useQuery({
    queryKey: ["audit", action],
    queryFn: () => api.get(`/audit${action ? `?action=${action}` : ""}`),
    refetchInterval: 8000,
  });

  async function verifyChain() {
    setChain(await api.get("/audit/verify"));
  }
  async function exportCsv() {
    const res = await fetch(api.fileUrl("/audit/export"), { headers: api.authHeaders() });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dkip-audit.csv";
    a.click();
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Audit Log"
          sub="Immutable, tamper-evident record of all platform actions"
          action={
            <div className="flex gap-2">
              <HoloButton variant="ghost" onClick={verifyChain}>
                <Fingerprint className="h-4 w-4" /> Verify integrity
              </HoloButton>
              <HoloButton variant="ghost" onClick={exportCsv}>
                <Download className="h-4 w-4" /> Export CSV
              </HoloButton>
            </div>
          }
        />

        {chain && (
          <GlassPanel
            className={cx("mb-4 flex items-center gap-3 p-4", chain.valid ? "!border-ok/40" : "!border-critical/50")}
            hover={false}
          >
            {chain.valid ? <ShieldCheck className="h-6 w-6 text-ok" /> : <ShieldX className="h-6 w-6 text-critical" />}
            <div>
              <div className="text-sm font-semibold text-fg-hi">
                {chain.valid ? "Log integrity verified — no tampering detected" : "Integrity check failed — tampering detected"}
              </div>
              <div className="stamp text-fg-low">{chain.count} events · each row = H(prev ‖ event)</div>
            </div>
          </GlassPanel>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button key={a || "all"} onClick={() => setAction(a)} className={cx("chip capitalize", action === a && "chip-active")}>
              {a || "All activity"}
            </button>
          ))}
        </div>

        <GlassPanel className="overflow-hidden p-0" hover={false}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-1 font-mono text-[11px] uppercase tracking-wide text-fg-low">
              <tr>
                <th className="px-4 py-2.5">Seq</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Target</th>
                <th className="px-4 py-2.5">Hash</th>
                <th className="px-4 py-2.5">Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(events.data ?? []).map((e: any) => (
                <tr key={e.seq} className="border-b border-line/60 transition-colors hover:bg-surface-1/60">
                  <td className="px-4 py-2 font-mono text-xs text-fg-low">{e.seq}</td>
                  <td className="px-4 py-2">
                    <Badge tone={e.action === "query" ? "signal" : "neutral"}>{e.action}</Badge>
                  </td>
                  <td className="px-4 py-2 text-fg-mid">{e.actor || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-fg-low">
                    {e.target_type} {e.target_id?.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-accent">{e.hash}…</td>
                  <td className="px-4 py-2 stamp text-fg-low">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {e.target_type === "answer" && e.target_id && (
                      <HoloButton variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setVerifyId(e.target_id)}>
                        <FileCheck2 className="h-3.5 w-3.5" /> Verify
                      </HoloButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>

        {verifyId && <VerifyModal answerId={verifyId} onClose={() => setVerifyId(null)} />}
      </div>
    </PageTransition>
  );
}

function VerifyModal({ answerId, onClose }: { answerId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["verify", answerId], queryFn: () => api.get(`/answers/${answerId}/verify`) });
  const d = q.data;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <GlassPanel className="max-h-[85vh] w-full max-w-2xl overflow-auto p-6" hover={false} onClick={(e: any) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <span className="eyebrow text-accent">Source re-verification</span>
          <HoloButton variant="ghost" className="!p-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </HoloButton>
        </div>
        {!d ? (
          <div className="py-8 text-center text-fg-low">Resolving…</div>
        ) : (
          <>
            <div className="stamp text-fg-low">Question</div>
            <p className="mb-3 text-fg-hi">{d.question}</p>
            <div className="stamp text-fg-low">
              Answer ({d.provider} · {d.model})
            </div>
            <p className="mb-4 text-sm text-fg-mid">{d.answer ?? "— abstained —"}</p>
            <div className="stamp mb-2 text-fg-low">Exact chunks used ({d.sources.length})</div>
            <div className="space-y-2">
              {d.sources.map((s: any, i: number) => (
                <GlassPanel key={i} className="p-3" hover={false}>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.resolved ? "ok" : "critical"}>{s.resolved ? "resolved" : "missing"}</Badge>
                    <span className="font-mono text-xs text-fg-hi">
                      {s.doc} §{s.section} p.{s.page}
                    </span>
                  </div>
                  {s.text && <p className="mt-1.5 text-xs leading-5 text-fg-mid">{s.text}…</p>}
                </GlassPanel>
              ))}
            </div>
          </>
        )}
      </GlassPanel>
    </motion.div>
  );
}
