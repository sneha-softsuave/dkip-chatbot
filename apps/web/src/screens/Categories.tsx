import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageContainer } from "../components/PageContainer";
import { PageTransition } from "../components/PageTransition";
import { Button, InputField, PageHeader, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";

interface CategoryItem {
  slug: string;
  name: string;
  description?: string;
  documents: number;
}

type Tab = "areas" | "kinds";

const TABS: { key: Tab; label: string; path: string; queryKey: string; hasDescription: boolean }[] = [
  { key: "areas", label: "Knowledge areas", path: "/collections", queryKey: "collections", hasDescription: true },
  { key: "kinds", label: "Document kinds", path: "/doc-kinds", queryKey: "doc-kinds", hasDescription: false },
];

/**
 * Knowledge areas and document kinds, in one editor. Its own screen, matching
 * this app's own precedent: People was split out of the console because
 * managing a list is a different job from watching the platform.
 */
export function Categories() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("areas");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CategoryItem | null>(null);
  const [removing, setRemoving] = useState<CategoryItem | null>(null);

  const active = TABS.find((t) => t.key === tab)!;
  const items = useQuery<CategoryItem[]>({
    queryKey: [active.queryKey],
    queryFn: () => api.get(active.path),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [active.queryKey] });
  const remove = useMutation({
    mutationFn: (slug: string) => api.del(`${active.path}/${slug}`),
    onSuccess: () => {
      invalidate();
      setRemoving(null);
    },
  });

  const rows = items.data ?? [];
  const noun = tab === "areas" ? "knowledge area" : "document kind";
  const GRID = active.hasDescription
    ? "grid grid-cols-[minmax(0,1fr)_1fr_7rem_4.5rem] items-center gap-4"
    : "grid grid-cols-[minmax(0,1fr)_7rem_4.5rem] items-center gap-4";

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          icon={FolderTree}
          eyebrow="Taxonomy"
          title="Categories"
          sub="The lists every upload and filter draw from."
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add {noun}
            </Button>
          }
        />

        <div className="mb-4 flex gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cx("chip", tab === t.key && "chip-active")}>
              {t.label}
            </button>
          ))}
        </div>

        {items.isLoading ? (
          <div className="surface-card divide-y divide-line">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cx(GRID, "px-4 py-3")}>
                <Skeleton className="h-3.5 w-32" />
                {active.hasDescription && <Skeleton className="h-3 w-48" />}
                <Skeleton className="h-3 w-10" />
                <span />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon={FolderTree}
              title={`No ${tab === "areas" ? "knowledge areas" : "document kinds"} yet`}
              body="Add one to start filing documents under it."
              action={
                <Button onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add {noun}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="surface-card divide-y divide-line">
            <div className={cx(GRID, "tbl-head")}>
              <span>Name</span>
              {active.hasDescription && <span>Description</span>}
              <span>Documents</span>
              <span />
            </div>
            {rows.map((item) => (
              <div key={item.slug} className={cx(GRID, "tbl-row")}>
                <span className="truncate text-body text-fg-hi">{item.name}</span>
                {active.hasDescription && (
                  <span className="truncate text-body text-fg-low">{item.description || "—"}</span>
                )}
                <span className="tabular text-body text-fg-low">{item.documents}</span>
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => setEditing(item)}
                    title={`Rename ${item.name}`}
                    aria-label={`Rename ${item.name}`}
                    className="rounded-md p-1.5 text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg-hi"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => setRemoving(item)}
                    disabled={item.documents > 0}
                    title={item.documents > 0 ? `Move or delete these ${item.documents} documents first` : `Delete ${item.name}`}
                    aria-label={`Delete ${item.name}`}
                    className="rounded-md p-1.5 text-fg-dim transition-colors hover:bg-surface-2 hover:text-critical disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-dim"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <CategoryDialog
          open={adding || !!editing}
          path={active.path}
          hasDescription={active.hasDescription}
          noun={noun}
          editing={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={invalidate}
        />

        <ConfirmDialog
          open={!!removing}
          onClose={() => setRemoving(null)}
          onConfirm={() => removing && remove.mutate(removing.slug)}
          loading={remove.isPending}
          tone="critical"
          title={`Delete ${removing?.name}?`}
          confirmLabel={`Delete ${noun}`}
          body={<>This cannot be undone.</>}
        />
      </PageContainer>
    </PageTransition>
  );
}

function CategoryDialog({
  open,
  path,
  hasDescription,
  noun,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  path: string;
  hasDescription: boolean;
  noun: string;
  editing: CategoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const blank = { name: "", description: "" };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(editing ? { name: editing.name, description: editing.description ?? "" } : blank);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`${path}/${editing.slug}`, hasDescription ? form : { name: form.name })
        : api.post(path, hasDescription ? form : { name: form.name }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e: Error) => setError(e.message || `Could not save this ${noun}.`),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={editing ? `Rename ${noun}` : `Add ${noun}`}
      panelClassName="w-full max-w-lg rounded-xl border border-line-strong bg-surface-1 p-5 shadow-e3"
    >
      <h2 className="text-h2 text-fg-hi">{editing ? `Rename ${noun}` : `Add ${noun}`}</h2>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-label text-fg-mid">Name</label>
          <InputField
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={hasDescription ? "Field Trials" : "Checklist"}
          />
        </div>
        {hasDescription && (
          <div>
            <label className="mb-1.5 block text-label text-fg-mid">Description</label>
            <InputField value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-body text-critical">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim()}>
          {editing ? "Save" : `Add ${noun}`}
        </Button>
      </div>
    </Modal>
  );
}
