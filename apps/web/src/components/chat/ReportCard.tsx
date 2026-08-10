import { Check, Download, ExternalLink, FileDown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../lib/api";
import type { Citation, ReportChartSpec, ReportSection } from "../../lib/types";
import { AnswerBody } from "../answer";
import { ReportChart } from "../ReportChart";
import { Button, cx } from "../ui";
import { Gutter, provenanceOf } from "../ProvenanceGutter";

export interface ReportCardData {
  report_id?: string;
  title?: string;
  sections?: ReportSection[];
  charts?: ReportChartSpec[];
}

/** Chart pictures captured from the rendered SVGs, sent along on export. */
type ChartImages = Record<string, string>;

export async function exportReport(
  reportId: string,
  format: "pdf" | "docx",
  images: ChartImages,
  title: string,
) {
  const res = await fetch(api.fileUrl(`/reports/${reportId}/export?format=${format}`), {
    method: "POST",
    headers: api.authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      chart_images: Object.entries(images).map(([key, png_base64]) => ({ key, png_base64 })),
    }),
  });
  if (!res.ok) throw new Error("export failed");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title || "report"}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * The report as a working surface: read it, ask the assistant to change it, or
 * edit it by hand. Manual edits keep whatever `[Sn]` markers the text still
 * carries, so deleting a cited sentence removes its chip too — the citations
 * always describe what is actually on the page.
 */
export function ReportCard({
  data,
  onOpenCitation,
  compact = true,
  editable = false,
  onSaved,
}: {
  data: ReportCardData;
  onOpenCitation: (c: Citation) => void;
  compact?: boolean;
  /** Editing lives in the conversation, where the assistant can also act on it.
   *  The Reports tab is a read-only archive. */
  editable?: boolean;
  onSaved?: (data: ReportCardData) => void;
}) {
  const navigate = useNavigate();
  const [images, setImages] = useState<ChartImages>({});
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ReportCardData>(data);

  // The assistant can change the report while it is on screen; keep up unless
  // the user is part-way through editing it themselves.
  useEffect(() => {
    if (!editing) setDraft(data);
  }, [data, editing]);

  const shown = editing ? draft : data;
  const sections = shown.sections ?? [];
  const charts = shown.charts ?? [];

  async function doExport(format: "pdf" | "docx") {
    if (!data.report_id) return;
    setBusy(format);
    try {
      await exportReport(data.report_id, format, images, shown.title ?? "report");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!data.report_id) return;
    setSaving(true);
    try {
      const saved = await api.patch(`/reports/${data.report_id}`, {
        title: draft.title,
        draft: { title: draft.title, sections: draft.sections, charts: draft.charts },
      });
      setEditing(false);
      onSaved?.({ ...draft, report_id: data.report_id });
      return saved;
    } finally {
      setSaving(false);
    }
  }

  function patchSection(key: string, patch: Partial<ReportSection>) {
    setDraft((d) => ({
      ...d,
      sections: (d.sections ?? []).map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="section-title mb-1">Report</div>
          {editing ? (
            <input
              value={draft.title ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="field text-h2"
              aria-label="Report title"
            />
          ) : (
            <h3 className="text-h2 text-fg-hi">{shown.title}</h3>
          )}
        </div>
        {editable && data.report_id && (
          <div className="flex shrink-0 gap-1">
            {editing ? (
              <>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(data);
                    setEditing(false);
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={cx("space-y-5 px-5 py-4", compact && !editing && "max-h-[560px] overflow-y-auto")}>
        {sections.map((s) => (
          <section key={s.key}>
            {editing ? (
              <>
                <div className="mb-1.5 flex items-center gap-2">
                  <input
                    value={s.label}
                    onChange={(e) => patchSection(s.key, { label: e.target.value })}
                    className="field py-1.5 text-h2"
                    aria-label={`Heading for ${s.label}`}
                  />
                  <button
                    onClick={() =>
                      setDraft((d) => ({ ...d, sections: (d.sections ?? []).filter((x) => x.key !== s.key) }))
                    }
                    className="shrink-0 text-fg-dim transition-colors hover:text-critical"
                    title="Remove section"
                    aria-label={`Remove ${s.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  value={s.value_marked || s.value || ""}
                  onChange={(e) => patchSection(s.key, { value: e.target.value, value_marked: e.target.value })}
                  rows={Math.min(18, Math.max(4, (s.value_marked || s.value || "").split("\n").length + 3))}
                  className="field resize-y font-normal leading-6"
                  aria-label={`Text of ${s.label}`}
                />
              </>
            ) : (
              <Gutter tone={s.unsupported ? "critical" : provenanceOf({ citations: s.citations })}>
                <h4 className="mb-1.5 text-h2 text-fg-hi">{s.label}</h4>
                {s.unsupported ? (
                  <p className="text-body text-fg-low">
                    {s.value || "The documents in scope don't cover this."} Add a document, or ask
                    me to drop this section.
                  </p>
                ) : (
                  <AnswerBody
                    marked={s.value_marked || s.value || ""}
                    citations={s.citations ?? []}
                    evidence={[]}
                    onOpen={onOpenCitation}
                  />
                )}
              </Gutter>
            )}
          </section>
        ))}

        {editing && (
          <button
            onClick={() =>
              setDraft((d) => ({
                ...d,
                sections: [
                  ...(d.sections ?? []),
                  { key: `manual_${(d.sections ?? []).length}`, label: "New section", value: "", citations: [] },
                ],
              }))
            }
            className="chip"
          >
            <Plus className="h-3 w-3" /> Add a section
          </button>
        )}

        {charts.map((chart) => (
          <section key={chart.title}>
            <h4 className="mb-1.5 text-h2 text-fg-hi">{chart.title}</h4>
            <ReportChart
              spec={chart}
              onImage={(key, png) => setImages((prev) => (prev[key] === png ? prev : { ...prev, [key]: png }))}
            />
            <p className="mt-1.5 text-label text-fg-dim">
              {chart.source === "documents"
                ? "Figures taken from the cited document text."
                : "From your equipment records."}
            </p>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" size="sm" onClick={() => doExport("pdf")} disabled={!!busy || editing}>
          {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={() => doExport("docx")} disabled={!!busy || editing}>
          {busy === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Word
        </Button>
        {compact && data.report_id && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/reports/${data.report_id}`)}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open full
          </Button>
        )}
        <span className="ml-auto text-label text-fg-dim">
          {editing
            ? "Editing — Save to keep your changes"
            : editable
              ? "Edit it here, or just ask me to change it"
              : "Open it in chat to make changes"}
        </span>
      </div>
    </div>
  );
}
