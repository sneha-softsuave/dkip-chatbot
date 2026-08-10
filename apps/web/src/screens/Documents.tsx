import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Files, Lock, ScrollText, Search, Trash2, UploadCloud, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../components/EmptyState";
import { PageContainer } from "../components/PageContainer";
import { Pagination } from "../components/Pagination";
import { PageTransition } from "../components/PageTransition";
import { Select } from "../components/Select";
import { StatBand, StatCard } from "../components/StatCard";
import { Badge, Button, PageHeader, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCollections, useDocKinds } from "../lib/taxonomy";
import type { DocumentMeta, Paged } from "../lib/types";

const SORTS = {
  recent: "Recently added",
  title: "Title A–Z",
  pages: "Longest first",
} as const;

const PAGE_SIZE = 15;

/** Columns are declared once so the header and the rows can never drift apart. */
const GRID = "grid grid-cols-[minmax(0,1fr)_7rem_6.5rem_4rem_7rem_2rem] items-center gap-4";

function shortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/**
 * The single document surface. Everyone reads here; admins also delete here.
 * Uploading lives in Knowledge base — there is one list of documents in the
 * app, not one per screen.
 */
export function Documents() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { me } = useAuth();
  const admin = me?.role === "admin";

  const docKinds = useDocKinds();
  const collections = useCollections();

  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [area, setArea] = useState("");
  const [classification, setClassification] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("recent");
  const [offset, setOffset] = useState(0);

  // Debounced so a search doesn't fire a request per keystroke now that
  // filtering is the server's job.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Any change to what is being asked for puts us back on page one — page 4 of
  // the old result set is meaningless against a new filter.
  useEffect(() => setOffset(0), [debounced, type, area, classification, sort]);

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), sort });
  if (debounced) params.set("q", debounced);
  if (type) params.set("doc_type", type);
  if (area) params.set("collection", area);
  if (classification) params.set("classification", classification);

  const docs = useQuery<Paged<DocumentMeta>>({
    queryKey: ["documents", debounced, type, area, classification, sort, offset],
    queryFn: () => api.get(`/documents?${params}`),
    placeholderData: (prev) => prev, // keep the old page visible while the next loads
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });

  // Cheap cached aggregate for the stat band — shares its key with the console.
  const all = useQuery({
    queryKey: ["documents", "all"],
    queryFn: () => api.get("/documents?limit=200").then((r) => r.items),
  });
  const allDocs = (all.data ?? []) as { doc_type: string; classification: string }[];
  // Top two kinds by live count, replacing what used to be hardcoded manuals/procedures tiles.
  const topKinds = Object.entries(
    allDocs.reduce<Record<string, number>>((acc, d) => {
      acc[d.doc_type] = (acc[d.doc_type] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  const confidential = allDocs.filter((d) => d.classification !== "UNCLASSIFIED").length;

  const rows = docs.data?.items ?? [];
  const total = docs.data?.total ?? 0;
  const filtered = !!(query || type || area || classification);

  /** The file needs an auth header, so it can't be a plain link. */
  async function openFile(d: DocumentMeta) {
    const res = await fetch(api.fileUrl(`/documents/${d.id}/file`), { headers: api.authHeaders() });
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function clearFilters() {
    setQuery("");
    setType("");
    setArea("");
    setClassification("");
  }

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          icon={Files}
          eyebrow="Knowledge library"
          title="Documents"
          sub="Everything the assistant can answer from."
          action={
            admin && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/knowledge")}>
                <UploadCloud className="h-3.5 w-3.5" aria-hidden />
                Add documents
              </Button>
            )
          }
        />

        {allDocs.length > 0 && (
          <StatBand>
            <StatCard icon={Files} label="Documents" value={allDocs.length} />
            {topKinds.map(([kind, count], i) => (
              <StatCard key={kind} icon={i === 0 ? FileText : ScrollText} label={docKinds.label(kind)} value={count} />
            ))}
            <StatCard icon={Lock} label="Confidential" value={confidential} />
          </StatBand>
        )}

        {(total > 0 || filtered) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-dim" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or reference"
                aria-label="Search documents"
                className="field pl-9"
              />
            </div>
            <Select
              value={type}
              onChange={setType}
              aria-label="Filter by kind"
              options={[{ value: "", label: "All kinds" }, ...docKinds.options]}
            />
            <Select
              value={area}
              onChange={setArea}
              aria-label="Filter by knowledge area"
              options={[{ value: "", label: "All areas" }, ...collections.options]}
            />
            <Select
              value={classification}
              onChange={setClassification}
              aria-label="Filter by access"
              options={[
                { value: "", label: "All access" },
                { value: "UNCLASSIFIED", label: "Standard" },
                { value: "CONFIDENTIAL", label: "Confidential" },
              ]}
            />
            <Select
              value={sort}
              onChange={(v) => setSort(v as keyof typeof SORTS)}
              aria-label="Sort documents"
              options={Object.entries(SORTS).map(([value, label]) => ({ value, label }))}
            />
            {filtered && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-1 text-body text-fg-low transition-colors hover:text-fg-hi"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear
              </button>
            )}
          </div>
        )}

        {docs.isLoading ? (
          <div className="surface-card divide-y divide-line">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={cx(GRID, "px-4 py-3")}>
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-12" />
                <span />
              </div>
            ))}
          </div>
        ) : total === 0 && !filtered ? (
          <div className="surface-card">
            <EmptyState
              icon={FileText}
              title="No documents yet"
              body={
                admin
                  ? "Add manuals, procedures and records, and the assistant will start answering from them."
                  : "An administrator adds documents from the Knowledge base. They'll show up here once they do."
              }
              action={
                admin && (
                  <Button onClick={() => navigate("/knowledge")}>
                    <UploadCloud className="h-4 w-4" aria-hidden />
                    Add documents
                  </Button>
                )
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon={Search}
              title="No matches"
              body="No document matches these filters. Try a different search, or clear them to see all documents."
              action={
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="surface-card divide-y divide-line">
              <div className={cx(GRID, "tbl-head")}>
                <span>Document</span>
                <span>Kind</span>
                <span>Access</span>
                <span className="text-right">Pages</span>
                <span className="text-right">Added</span>
                <span />
              </div>
              {rows.map((d) => {
                const restricted = d.classification !== "UNCLASSIFIED";
                return (
                  <div
                    key={d.id}
                    className={cx(
                      GRID,
                      "group relative px-4 py-2 transition-colors duration-fast hover:bg-surface-2/60",
                    )}
                  >
                    {/* Gutter only where it says something. A rule on every row
                        would be decoration; a rule on the restricted ones is
                        the one thing worth noticing while scanning. */}
                    {restricted && (
                      <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-caution" aria-hidden />
                    )}

                    <div className="min-w-0">
                      <button
                        onClick={() => openFile(d)}
                        className="block max-w-full truncate text-left text-body text-fg-hi transition-colors hover:text-accent"
                      >
                        {d.title}
                      </button>
                      <span className="stamp">{d.doc_code}</span>
                    </div>

                    <span className="truncate text-body text-fg-low">{docKinds.label(d.doc_type)}</span>

                    <span>
                      {restricted ? (
                        <Badge tone="caution">Confidential</Badge>
                      ) : (
                        <span className="text-body text-fg-dim">Standard</span>
                      )}
                    </span>

                    <span className="tabular text-right text-body text-fg-low">{d.page_count}</span>
                    <span className="tabular whitespace-nowrap text-right text-body text-fg-low">{shortDate(d.created_at)}</span>

                    <div className="flex justify-end opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
                      {admin ? (
                        <button
                          onClick={() => del.mutate(d.id)}
                          title={`Delete ${d.title}`}
                          aria-label={`Delete ${d.title}`}
                          className="rounded-sm p-1 text-fg-dim transition-colors hover:text-critical"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => openFile(d)}
                          title={`Open ${d.title}`}
                          aria-label={`Open ${d.title}`}
                          className="rounded-sm p-1 text-fg-dim transition-colors hover:text-fg-hi"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffset={setOffset} />
          </>
        )}
      </PageContainer>
    </PageTransition>
  );
}
