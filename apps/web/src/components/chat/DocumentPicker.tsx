import { useQuery } from "@tanstack/react-query";
import { Check, FileText } from "lucide-react";
import { useState } from "react";

import { api } from "../../lib/api";
import type { DocumentMeta } from "../../lib/types";
import { Modal } from "../Modal";
import { Button, Spinner, cx } from "../ui";

const MAX = 3;

export function DocumentPicker({
  open,
  selected,
  onClose,
  onConfirm,
}: {
  open: boolean;
  selected: string[];
  onClose: () => void;
  onConfirm: (docIds: string[]) => void;
}) {
  const docs = useQuery<DocumentMeta[]>({
    queryKey: ["documents", "all"],
    queryFn: () => api.get("/documents?limit=200").then((r) => r.items),
    enabled: open,
  });
  const [picked, setPicked] = useState<string[]>(selected);
  const [filter, setFilter] = useState("");

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX ? [...p, id] : p));
  }

  const list = (docs.data ?? []).filter(
    (d) =>
      !filter ||
      d.title.toLowerCase().includes(filter.toLowerCase()) ||
      d.doc_code.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Modal open={open} onClose={onClose} label="Choose documents" panelClassName="w-full max-w-2xl p-5">
      <h2 className="text-base font-semibold text-fg-hi">Choose documents</h2>
      <p className="mt-1 text-sm text-fg-low">
        The report will be written only from what these documents say. Pick up to {MAX}.
      </p>

      <input
        className="field mt-4"
        placeholder="Search by name…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="mt-3 max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
        {docs.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-low">No documents match that.</p>
        ) : (
          list.map((d) => {
            const on = picked.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                  on ? "border-accent/50 bg-accent-surface" : "border-line bg-surface-1 hover:bg-surface-2",
                )}
              >
                <FileText className={cx("h-4 w-4 shrink-0", on ? "text-accent" : "text-fg-low")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg-hi">{d.title}</span>
                  <span className="block truncate text-[11px] text-fg-low">{d.doc_code}</span>
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <span className="text-xs text-fg-low">
          {picked.length} of {MAX} selected
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(picked)}>Use these documents</Button>
        </div>
      </div>
    </Modal>
  );
}
