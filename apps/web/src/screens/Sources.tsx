import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge, PageHeader, Panel, Spinner, cx } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { DocumentMeta } from "../lib/types";

const TYPE_TONE: Record<string, "neutral" | "signal" | "caution"> = {
  manual: "signal",
  sop: "neutral",
  record: "neutral",
  engineering: "caution",
};

export function Sources() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [type, setType] = useState<string>("");
  const docs = useQuery<DocumentMeta[]>({
    queryKey: ["documents", type],
    queryFn: () => api.get(`/documents${type ? `?doc_type=${type}` : ""}`),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/documents/${id}`),
    onSuccess: (_data, id) => {
      // Remove from current filter's cache immediately
      qc.setQueryData<DocumentMeta[]>(["documents", type], (old) =>
        old ? old.filter((d) => d.id !== id) : old,
      );
      // Also invalidate all other document queries so they refetch
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  async function openFile(d: DocumentMeta) {
    const res = await fetch(api.fileUrl(`/documents/${d.id}/file`), { headers: api.authHeaders() });
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  const types = ["", "manual", "sop", "record", "engineering"];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Document Library" sub="Browse, open, and manage indexed documents" />

      <div className="mb-4 flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t || "all"} onClick={() => setType(t)} className={cx("chip capitalize", type === t && "chip-active")}>
            {t || "All types"}
          </button>
        ))}
      </div>

      {docs.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : !docs.data || docs.data.length === 0 ? (
        <Panel className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <FileText className="h-8 w-8 text-fg-low" />
          <div className="text-sm font-medium text-fg-mid">No documents indexed yet</div>
          <p className="max-w-xs text-sm text-fg-low">
            Upload documents through the Ingestion console to populate the library.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(docs.data ?? []).map((d) => (
            <Panel key={d.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between">
                <FileText className="h-5 w-5 text-accent" />
                <div className="flex gap-1">
                  <Badge tone={TYPE_TONE[d.doc_type] ?? "neutral"}>{d.doc_type}</Badge>
                  {d.classification !== "UNCLASSIFIED" && <Badge tone="caution">{d.classification}</Badge>}
                </div>
              </div>
              <div className="mt-2 font-mono text-xs text-fg-low">{d.doc_code}</div>
              <div className="text-base font-semibold leading-snug text-fg-hi">{d.title}</div>
              <div className="stamp mt-2 flex flex-wrap gap-x-3 gap-y-1 text-fg-low">
                <span>rev {d.revision}</span>
                <span>{d.page_count}p</span>
                {d.unit && <span>{d.unit}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <button className="btn-ghost !py-1.5 text-xs" onClick={() => openFile(d)}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </button>
                {me?.role === "admin" && (
                  <button className="btn-ghost !py-1.5 !px-2 text-xs text-critical hover:border-critical/50"
                    onClick={() => del.mutate(d.id)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
