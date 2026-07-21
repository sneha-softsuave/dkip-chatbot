import { FileWarning, Loader2, X } from "lucide-react";
import { motion } from "framer-motion";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import type { SourceResolved } from "../lib/types";
import { GlassPanel } from "./GlassPanel";
import { Badge, Spinner, cx } from "./ui";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface SourceTarget {
  chunkId: string;
}

export function SourceViewer({ target, onClose }: { target: SourceTarget; onClose: () => void }) {
  const [meta, setMeta] = useState<SourceResolved | null>(null);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [highlight, setHighlight] = useState<{ left: number; top: number; w: number; h: number } | null>(null);

  useEffect(() => {
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
  }, [target.chunkId]);

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        transition={{ duration: 0.25 }}
        className="flex h-[88vh] w-full max-w-6xl gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Document render */}
        <GlassPanel className="flex min-w-0 flex-1 flex-col p-4" hover={false}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="eyebrow text-accent">Source viewer</span>
              {meta?.superseded && <Badge tone="caution">superseded revision</Badge>}
            </div>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onClose} className="btn-ghost !p-2" aria-label="Close">
              <X className="h-4 w-4" />
            </motion.button>
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
                  className="pointer-events-none absolute border-2 border-accent bg-accent/15"
                  style={{ left: highlight.left, top: highlight.top, width: highlight.w, height: highlight.h }}
                >
                  <span className="absolute -top-5 left-0 rounded bg-accent px-1.5 font-mono text-[10px] text-bg">
                    cited passage
                  </span>
                </motion.div>
              )}
            </div>
            {error && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-mid">
                <FileWarning className="h-8 w-8 text-caution" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        </GlassPanel>

        {/* Passage + anchor metadata */}
        <GlassPanel className="flex w-[340px] shrink-0 flex-col p-4" hover={false}>
          {!meta ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-fg-low" />
            </div>
          ) : (
            <>
              <span className="eyebrow text-accent">Citation anchor</span>
              <div className="mt-3 space-y-2 font-mono text-xs">
                <Row k="DOC" v={meta.doc_code} />
                <Row k="TITLE" v={meta.title} />
                <Row k="SECTION" v={`§ ${meta.section || "-"}`} />
                <Row k="PAGE" v={`${meta.page_start}${meta.page_end !== meta.page_start ? `–${meta.page_end}` : ""}`} />
                <Row k="REVISION" v={meta.revision} />
                <Row k="CLASS" v={meta.classification} />
                {meta.ocr_confidence != null && <Row k="OCR" v={`${Math.round(meta.ocr_confidence * 100)}% conf`} />}
              </div>
              <div className="mt-4 flex-1 overflow-auto">
                <span className="eyebrow text-accent">Supporting passage</span>
                <p className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface-1 p-3 text-[13px] leading-6 text-fg-hi">
                  {meta.text}
                </p>
              </div>
            </>
          )}
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-1.5">
      <span className="text-fg-dim">{k}</span>
      <span className={cx("text-right text-fg-hi", k === "DOC" && "font-semibold text-accent")}>{v}</span>
    </div>
  );
}
