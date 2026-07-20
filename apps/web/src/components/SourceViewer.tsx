import { FileWarning, Loader2, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import type { SourceResolved } from "../lib/types";
import { Badge, Panel, Spinner } from "./ui";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex h-[88vh] w-full max-w-6xl gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Document render */}
        <Panel className="flex min-w-0 flex-1 flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="eyebrow">Source Viewer</span>
              {meta?.superseded && <Badge tone="caution">superseded revision</Badge>}
            </div>
            <button onClick={onClose} className="btn-ghost !p-2" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={containerRef} className="relative flex-1 overflow-auto rounded-[3px] bg-[#11161d] p-4">
            {rendering && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <Spinner className="h-6 w-6" />
              </div>
            )}
            <div className="relative mx-auto w-fit">
              <canvas ref={canvasRef} className="block shadow-lg" />
              {highlight && (
                <div
                  className="pointer-events-none absolute animate-rise border-2 border-signal bg-signal/20"
                  style={{ left: highlight.left, top: highlight.top, width: highlight.w, height: highlight.h }}
                >
                  <span className="absolute -top-5 left-0 rounded-[2px] bg-signal px-1 font-mono text-[10px] text-ink">
                    cited passage
                  </span>
                </div>
              )}
            </div>
            {error && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-mid">
                <FileWarning className="h-8 w-8 text-caution" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        </Panel>

        {/* Passage + anchor metadata */}
        <Panel className="flex w-[340px] shrink-0 flex-col p-4" raised>
          {!meta ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-fg-low" />
            </div>
          ) : (
            <>
              <span className="eyebrow">Citation Anchor</span>
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
                <span className="eyebrow">Supporting passage</span>
                <p className="mt-2 whitespace-pre-wrap rounded-[3px] border border-line bg-ink/50 p-3 text-[13px] leading-6 text-fg-hi">
                  {meta.text}
                </p>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-1">
      <span className="text-fg-low">{k}</span>
      <span className="text-right text-fg-hi">{v}</span>
    </div>
  );
}
