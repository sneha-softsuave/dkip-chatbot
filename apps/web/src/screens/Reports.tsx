import { useQuery } from "@tanstack/react-query";
import { Download, FileDown, FileText, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

import { GlassPanel } from "../components/GlassPanel";
import { PageTransition, StaggerContainer, StaggerItem } from "../components/PageTransition";
import { Badge, HoloButton, InputField, PageHeader, cx } from "../components/ui";
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
  const [topic, setTopic] = useState("fleet inspection and serviceability");
  const [scopeUnit, setScopeUnit] = useState("");

  async function generate(templateId: string) {
    setBusy(true);
    try {
      const scope: any = {};
      if (scopeUnit) scope.unit = scopeUnit;
      setDraft(await api.post("/reports", { template_id: templateId, topic, scope }));
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
    <PageTransition>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Reports" sub="Generate structured, citable reports from templates" />

        {!draft ? (
          <div>
            <div className="mb-4 flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-fg-mid">Topic / focus area</label>
                <InputField value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. fleet inspection and serviceability" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-mid">Scope unit</label>
                <InputField className="w-40" value={scopeUnit} onChange={(e) => setScopeUnit(e.target.value)} placeholder="optional" />
              </div>
            </div>
            <StaggerContainer className="grid gap-3 sm:grid-cols-2">
              {(templates.data ?? []).map((t: { id: string; name: string; description: string; fields: unknown[] }) => (
                <StaggerItem key={t.id}>
                  <GlassPanel className="flex flex-col p-5" hover>
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-surface">
                      <FileText className="h-5 w-5 text-accent" />
                    </div>
                    <div className="mt-3 text-base font-semibold text-fg-hi">{t.name}</div>
                    <p className="mt-1 flex-1 text-sm text-fg-mid">{t.description}</p>
                    <div className="stamp mt-2 text-fg-low">{t.fields.length} cited fields</div>
                    <HoloButton className="mt-4" onClick={() => generate(t.id)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate draft
                    </HoloButton>
                  </GlassPanel>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-fg-hi">{draft.title}</div>
                <div className="stamp text-fg-low">Draft · editable before export · classification marking applied</div>
              </div>
              <div className="flex gap-2">
                <HoloButton variant="ghost" onClick={() => setDraft(null)}>
                  Back
                </HoloButton>
                <HoloButton variant="ghost" onClick={() => exportAs("docx")}>
                  <Download className="h-4 w-4" /> DOCX
                </HoloButton>
                <HoloButton onClick={() => exportAs("pdf")}>
                  <FileDown className="h-4 w-4" /> PDF
                </HoloButton>
              </div>
            </div>
            <div className="space-y-4">
              {draft.fields.map((f, i) => (
                <GlassPanel key={f.key} className="p-4" hover={false}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="eyebrow text-accent">{f.label}</span>
                    <div className="flex gap-1">
                      {f.citations?.map((c) => (
                        <Badge key={c.sid} tone="signal">
                          {c.sid} · {c.doc} p.{c.page}
                        </Badge>
                      ))}
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
                </GlassPanel>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
