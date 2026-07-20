import { useQuery } from "@tanstack/react-query";
import { Download, FileDown, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

import { Badge, PageHeader, Panel } from "../components/ui";
import { api } from "../lib/api";

interface Field {
  key: string;
  label: string;
  value: string;
  citations: { sid: number; doc: string; section: string; page: number }[];
}
interface Draft {
  id: string;
  title: string;
  template: string;
  fields: Field[];
}

export function Reports() {
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.get("/report-templates") });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(templateId: string) {
    setBusy(true);
    try {
      setDraft(await api.post("/reports", { template_id: templateId }));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    await api.patch(`/reports/${draft.id}`, { draft: { template: draft.template, fields: draft.fields } });
  }

  async function exportAs(fmt: "pdf" | "docx") {
    if (!draft) return;
    await save();
    const res = await fetch(api.fileUrl(`/reports/${draft.id}/export?format=${fmt}`), {
      method: "POST",
      headers: api.authHeaders(),
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.title}.${fmt}`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Reports" sub="Create and export structured reports with source citations" />

      {!draft ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(templates.data ?? []).map((t: { id: string; name: string; description: string; fields: unknown[] }) => (
            <Panel key={t.id} className="flex flex-col p-5">
              <FileText className="h-5 w-5 text-accent" />
              <div className="mt-2 text-base font-semibold text-fg-hi">{t.name}</div>
              <p className="mt-1 flex-1 text-sm text-fg-mid">{t.description}</p>
              <div className="stamp mt-2 text-fg-low">{t.fields.length} cited fields</div>
              <button className="btn-primary mt-4" onClick={() => generate(t.id)} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate draft
              </button>
            </Panel>
          ))}
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-fg-hi">{draft.title}</div>
              <div className="stamp text-fg-low">Draft · editable before export · classification marking applied</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setDraft(null)}>Back</button>
              <button className="btn-ghost" onClick={() => exportAs("docx")}><Download className="h-4 w-4" /> DOCX</button>
              <button className="btn-primary" onClick={() => exportAs("pdf")}><FileDown className="h-4 w-4" /> PDF</button>
            </div>
          </div>
          <div className="space-y-4">
            {draft.fields.map((f, i) => (
              <Panel key={f.key} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="eyebrow">{f.label}</span>
                  <div className="flex gap-1">
                    {f.citations?.map((c) => <Badge key={c.sid} tone="signal">{c.sid} · {c.doc} p.{c.page}</Badge>)}
                  </div>
                </div>
                <textarea
                  className="field min-h-[90px] resize-y leading-6"
                  value={f.value}
                  onChange={(e) => {
                    const fields = [...draft.fields];
                    fields[i] = { ...f, value: e.target.value };
                    setDraft({ ...draft, fields });
                  }}
                />
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
