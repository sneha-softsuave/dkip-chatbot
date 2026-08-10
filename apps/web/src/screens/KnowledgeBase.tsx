import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, CloudUpload, Loader2, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageContainer } from "../components/PageContainer";
import { PageTransition } from "../components/PageTransition";
import { Select } from "../components/Select";
import { Button, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";
import { useCollections, useDocKinds } from "../lib/taxonomy";

interface Upload {
  filename: string;
  state: "processing" | "ready" | "failed";
  error?: string;
}

/**
 * Bringing content in — and nothing else. This screen used to end with a second
 * copy of the document list, which meant two places to look at the same data
 * and two different sets of actions on it. The list lives on Documents; this
 * screen hands off to it when an upload finishes.
 *
 * Progress is reported in plain language: no job ids, no passage counts —
 * nobody adding a manual needs them.
 */
export function KnowledgeBase() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const still = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [collection, setCollection] = useState("");
  const [docType, setDocType] = useState("");
  const [classification, setClassification] = useState("UNCLASSIFIED");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const collections = useCollections();
  const docKinds = useDocKinds();
  // Default to the first item once the lists load — a hardcoded slug points at
  // nothing the day someone deletes the area or kind it named.
  useEffect(() => {
    if (!collection && collections.options.length) setCollection(collections.options[0].value);
  }, [collection, collections.options]);
  useEffect(() => {
    if (!docType && docKinds.options.length) setDocType(docKinds.options[0].value);
  }, [docType, docKinds.options]);

  const done = uploads.length > 0 && !busy && uploads.some((u) => u.state === "ready");

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setUploads(files.map((f) => ({ filename: f.name, state: "processing" })));
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("collection", collection);
    form.append("doc_type", docType);
    form.append("classification", classification);
    try {
      const res = await api.upload("/documents", form);
      setFiles([]);
      await waitForJob(res.job_id);
    } catch (e) {
      setUploads((u) => u.map((x) => ({ ...x, state: "failed", error: (e as Error).message })));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["documents"] });
    }
  }

  /** Poll until processing finishes; surface only per-file outcomes. */
  async function waitForJob(jobId: string) {
    for (let i = 0; i < 120; i++) {
      const job = await api.get(`/ingestion/jobs/${jobId}`).catch(() => null);
      if (job) {
        setUploads(
          (job.files ?? []).map((f: { filename: string; status: string; error?: string }) => ({
            filename: f.filename,
            state: f.status === "ok" ? "ready" : f.status === "failed" ? "failed" : "processing",
            error: f.error ? "We couldn't read this file." : undefined,
          })),
        );
        if (job.status !== "running") return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          icon={CloudUpload}
          eyebrow="Document ingestion"
          title="Knowledge base"
          sub="Add documents for the assistant to answer from."
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("/documents")}>
              View all documents
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          }
        />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                setFiles([...files, ...(Array.from(e.dataTransfer.files) as File[])]);
              }}
              className={cx(
                "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-14 text-center transition-colors duration-fast",
                drag ? "border-accent bg-accent-surface" : "border-line-strong bg-surface-1",
              )}
            >
              <motion.div
                animate={{ y: drag && !still ? -4 : 0 }}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent/25 bg-accent-surface text-accent shadow-glow"
              >
                <CloudUpload className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </motion.div>
              <div>
                <p className="text-h2 text-fg-hi">Drop documents here</p>
                <p className="mt-1 max-w-sm text-body text-fg-low">
                  PDFs, Word, PowerPoint, spreadsheets and text. Scanned pages are read automatically.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                Browse files
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => setFiles([...files, ...(Array.from(e.target.files ?? []) as File[])])}
              />
            </div>

            {files.length > 0 && (
              <div className="surface-card p-4">
                <div className="section-title">Ready to add</div>
                <div className="divide-y divide-line">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1 truncate text-body text-fg-hi">{f.name}</span>
                      <button
                        onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                        className="rounded-sm p-1 text-fg-dim transition-colors hover:text-critical"
                        aria-label={`Remove ${f.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploads.length > 0 && (
              <div className="surface-card p-4">
                <div className="section-title">Latest upload</div>
                <div className="divide-y divide-line">
                  {uploads.map((u, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                      {u.state === "ready" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
                      ) : u.state === "failed" ? (
                        <AlertCircle className="h-4 w-4 shrink-0 text-critical" aria-hidden />
                      ) : (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-low" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate text-body text-fg-hi">{u.filename}</span>
                      <span
                        className={cx(
                          "shrink-0 text-label",
                          u.state === "ready" ? "text-ok" : u.state === "failed" ? "text-critical" : "text-fg-low",
                        )}
                      >
                        {u.state === "ready" ? "Ready" : u.state === "failed" ? u.error ?? "Failed" : "Processing…"}
                      </span>
                    </div>
                  ))}
                </div>
                {done && (
                  <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate("/documents")}>
                    View in Documents
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="surface-card p-5">
            <div className="section-title">Where it belongs</div>
            <div className="space-y-4">
              <Field label="Knowledge area">
                <Select value={collection} onChange={setCollection} aria-label="Knowledge area" options={collections.options} />
              </Field>
              <Field label="Kind of document">
                <Select value={docType} onChange={setDocType} aria-label="Kind of document" options={docKinds.options} />
              </Field>
              <Field
                label="Who can see it"
                help="A confidential document is only searched for people with full access. To everyone else it behaves as if it were not here — it never appears in an answer, a citation or the library."
              >
                <Select
                  value={classification}
                  onChange={setClassification}
                  aria-label="Who can see it"
                  options={[
                    { value: "UNCLASSIFIED", label: "Standard", description: "Everyone can find it" },
                    {
                      value: "CONFIDENTIAL",
                      label: "Confidential",
                      description: "Only people with full access",
                    },
                  ]}
                />
              </Field>
            </div>
            <Button variant="hero" className="mt-5 w-full" disabled={!files.length} loading={busy} onClick={upload}>
              {!busy && <CloudUpload className="h-4 w-4" aria-hidden />}
              {busy ? "Adding…" : `Add ${files.length || ""} document${files.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </PageContainer>
    </PageTransition>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-label text-fg-mid">{label}</label>
      {children}
      {help && <p className="mt-1.5 text-label leading-relaxed text-fg-dim">{help}</p>}
    </div>
  );
}
