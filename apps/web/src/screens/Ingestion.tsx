import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, FileWarning, Loader2, XCircle } from "lucide-react";
import { useRef, useState } from "react";

import { Badge, PageHeader, Panel, StatusLed, cx } from "../components/ui";
import { api } from "../lib/api";

export function Ingestion() {
  const qc = useQueryClient();
  const colls = useQuery({ queryKey: ["collections-any"], queryFn: () => api.get("/collections") });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api.get("/ingestion/jobs"), refetchInterval: 4000 });

  const [files, setFiles] = useState<File[]>([]);
  const [collection, setCollection] = useState("veh-recovery");
  const [docType, setDocType] = useState("manual");
  const [classification, setClassification] = useState("UNCLASSIFIED");
  const [drag, setDrag] = useState(false);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    if (!files.length) return;
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("collection", collection);
    form.append("doc_type", docType);
    form.append("classification", classification);
    const res = await api.upload("/documents", form);
    setActiveJob(res.job_id);
    setFiles([]);
    qc.invalidateQueries({ queryKey: ["jobs"] });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Document Ingestion" sub="Upload and index new documents into the document library" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <Panel
            className={cx("flex flex-col items-center justify-center gap-3 border-dashed p-10 text-center transition-colors",
              drag && "border-accent/50 bg-accent/5")}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); setFiles([...files, ...Array.from(e.dataTransfer.files)]); }}
          >
            <CloudUpload className="h-8 w-8 text-accent" strokeWidth={1.5} />
            <div className="text-base font-semibold text-fg-hi">Drop documents to upload</div>
            <p className="text-sm text-fg-mid">PDF · DOCX · PPTX · TXT · HTML · CSV/XLSX · scanned PDFs are processed with OCR</p>
            <button className="btn-ghost mt-1" onClick={() => inputRef.current?.click()}>Browse files</button>
            <input ref={inputRef} type="file" multiple hidden
              onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          </Panel>

          {files.length > 0 && (
            <Panel className="mt-4 p-4">
              <div className="stamp mb-2 text-fg-low">{files.length} file(s) staged</div>
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-surface-1 px-3 py-1.5 text-sm">
                    <span className="truncate text-fg-hi">{f.name}</span>
                    <span className="stamp text-fg-low">{Math.round(f.size / 1024)} KB</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {activeJob && <LoadReport jobId={activeJob} />}
        </div>

        <Panel className="h-fit p-5">
          <span className="eyebrow">Upload settings</span>
          <div className="mt-3 space-y-3">
            <Select label="Collection" value={collection} onChange={setCollection}
              options={(colls.data ?? []).map((c: { slug: string; name: string }) => [c.slug, c.name])} />
            <Select label="Document type" value={docType} onChange={setDocType}
              options={[["manual", "Manual"], ["sop", "SOP"], ["record", "Record"], ["engineering", "Engineering"]]} />
            <Select label="Classification" value={classification} onChange={setClassification}
              options={[["UNCLASSIFIED", "Unclassified"], ["RESTRICTED", "Restricted (Clearance 2)"]]} />
          </div>
          <button className="btn-primary mt-5 w-full" disabled={!files.length} onClick={upload}>
            <CloudUpload className="h-4 w-4" /> Upload {files.length ? `(${files.length})` : ""}
          </button>
        </Panel>
      </div>

      <div className="mt-6">
        <span className="eyebrow">Recent jobs</span>
        <div className="mt-2 space-y-2">
          {(jobs.data ?? []).map((j: any) => (
            <button key={j.id} onClick={() => setActiveJob(j.id)}
              className="flex w-full items-center justify-between rounded-md border border-line bg-surface-2 px-4 py-2 text-left hover:border-accent/40">
              <div className="flex items-center gap-3">
                <StatusLed tone={j.status === "done" ? "ok" : j.status === "failed" ? "critical" : "caution"} />
                <span className="font-mono text-xs text-fg-hi">{j.id.slice(0, 8)}</span>
                <span className="stamp text-fg-low">{j.source}</span>
              </div>
              <span className="stamp text-fg-low">
                {j.summary?.ok ?? 0} ok · {j.summary?.failed ?? 0} failed · {j.summary?.skipped ?? 0} skipped
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadReport({ jobId }: { jobId: string }) {
  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.get(`/ingestion/jobs/${jobId}`),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1500 : false),
  });
  const d = job.data;
  return (
    <Panel className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">Upload report · {jobId.slice(0, 8)}</span>
        <Badge tone={d?.status === "done" ? "ok" : d?.status === "failed" ? "critical" : "caution"}>{d?.status ?? "…"}</Badge>
      </div>
      <div className="space-y-1">
        {(d?.files ?? []).map((f: any, i: number) => (
          <div key={i} className="flex items-center justify-between rounded-md bg-surface-1 px-3 py-1.5 text-sm">
            <span className="flex items-center gap-2">
              {f.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-ok" />
                : f.status === "failed" ? <XCircle className="h-4 w-4 text-critical" />
                  : <FileWarning className="h-4 w-4 text-caution" />}
              <span className="truncate text-fg-hi">{f.filename}</span>
              {f.ocr && <Badge tone="signal">OCR</Badge>}
            </span>
            <span className="stamp text-fg-low">{f.status === "failed" ? f.error : `${f.chunks} chunks`}</span>
          </div>
        ))}
        {d?.status === "running" && (
          <div className="flex items-center gap-2 px-3 py-2 text-fg-low">
            <Loader2 className="h-4 w-4 animate-spin" /> <span className="stamp">Processing…</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-fg-mid">{label}</label>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
