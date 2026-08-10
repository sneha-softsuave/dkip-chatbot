import { FileWarning, Loader2, X } from "lucide-react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import type { SourceResolved } from "../lib/types";
import { Modal } from "./Modal";
import { Badge, Spinner, cx } from "./ui";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface SourceTarget {
  chunkId: string;
}

export function SourceViewer({ target, onClose }: { target: SourceTarget | null; onClose: () => void }) {
  const [meta, setMeta] = useState<SourceResolved | null>(null);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [highlight, setHighlight] = useState<{ left: number; top: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setMeta(null);
    setError("");
    setHighlight(null);
    api
      .get(`/source?chunk_id=${target.chunkId}`)
      .then((m: SourceResolved) => !cancelled && setMeta(m))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [target?.chunkId]);

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const res = await fetch(api.fileUrl(`/documents/${meta.doc_id}/file`), {
          headers: api.authHeaders(),
        });
        if (!res.ok) throw new Error("could not load source file");
        const data = await res.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(meta.page_start);
        const scale = 1.4;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (meta.bbox) {
          const { x0, y0, x1, y1 } = meta.bbox;
          setHighlight({ left: x0 * scale, top: y0 * scale, w: (x1 - x0) * scale, h: (y1 - y0) * scale });
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta]);

  return (
    <Modal open={!!target} onClose={onClose} label="Source viewer" panelClassName="flex h-[88vh] w-full max-w-6xl gap-4">
        {/* Document render */}
        <div className="surface-elevated flex min-w-0 flex-1 flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="section-title mb-0">Source</span>
              {meta?.superseded && <Badge tone="caution">newer version exists</Badge>}
            </div>
            <button onClick={onClose} className="btn-ghost !p-2" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={containerRef} className="relative flex-1 overflow-auto rounded-lg border border-line bg-surface-1 p-4">
            {rendering && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            )}
            <div className="relative mx-auto w-fit">
              <canvas ref={canvasRef} className="block shadow-xl" />
              {highlight && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pointer-events-none absolute border-2 border-ok bg-ok/15"
                  style={{ left: highlight.left, top: highlight.top, width: highlight.w, height: highlight.h }}
                >
                  <span className="absolute -top-5 left-0 rounded-sm bg-ok px-1.5 text-micro font-medium text-bg">
                    quoted here
                  </span>
                </motion.div>
              )}
            </div>
            {error && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-mid">
                <FileWarning className="h-8 w-8 text-caution" />
                <span className="text-body">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Passage + anchor metadata */}
        <div className="surface-elevated flex w-[340px] shrink-0 flex-col p-5">
          {!meta ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-fg-low" />
            </div>
          ) : (
            <>
              <span className="section-title">Where this came from</span>
              <div className="space-y-2">
                <Row k="Document" v={meta.title} />
                <Row k="Reference" v={meta.doc_code} />
                <Row k="Section" v={meta.section ? `§ ${meta.section}` : "—"} />
                <Row k="Page" v={`${meta.page_start}${meta.page_end !== meta.page_start ? `–${meta.page_end}` : ""}`} />
              </div>
              <div className="mt-4 flex-1 overflow-auto">
                <span className="section-title">What it says</span>
                <p className="whitespace-pre-wrap rounded-md border border-line bg-surface-1 p-3 text-body leading-6 text-fg-hi">
                  {meta.text}
                </p>
              </div>
            </>
          )}
        </div>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-1.5">
      <span className="shrink-0 text-label text-fg-dim">{k}</span>
      <span className={cx("text-right text-body text-fg-hi", k === "Document" && "font-medium")}>{v}</span>
    </div>
  );
}
