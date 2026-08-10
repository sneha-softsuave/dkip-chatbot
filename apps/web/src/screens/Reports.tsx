import { useQuery } from "@tanstack/react-query";
import { FileText, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../components/EmptyState";
import { PageContainer } from "../components/PageContainer";
import { Pagination } from "../components/Pagination";
import { PageTransition } from "../components/PageTransition";
import { Button, PageHeader, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import type { Paged, ReportListItem } from "../lib/types";

const GRID = "grid grid-cols-[minmax(0,1fr)_6rem_6rem_6rem] items-center gap-4";

/** Smaller than the Documents page. Reports are grouped by recency, so a page
 *  that runs long buries the "Today" bucket the reader came for. */
const PAGE_SIZE = 15;

/** Buckets by recency. A flat list of dates makes you read every row to find "the one from this morning". */
function bucket(iso: string): "Today" | "This week" | "Earlier" {
  const age = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  if (age < day) return "Today";
  if (age < 7 * day) return "This week";
  return "Earlier";
}

/** Reports are written in the chat; this is only where you find them again. */
export function Reports() {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const reports = useQuery<Paged<ReportListItem>>({
    queryKey: ["reports", offset],
    queryFn: () => api.get(`/reports?limit=${PAGE_SIZE}&offset=${offset}`),
    placeholderData: (prev) => prev,
  });
  const items = reports.data?.items ?? [];
  const total = reports.data?.total ?? 0;

  const groups = useMemo(() => {
    const out: Record<string, ReportListItem[]> = {};
    for (const r of [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      (out[bucket(r.created_at)] ??= []).push(r);
    }
    return out;
  }, [items]);

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          icon={FileText}
          eyebrow="Report library"
          title="Reports"
          sub="Reports you've generated, ready to open or export."
        />

        {reports.isLoading ? (
          <div className="surface-card divide-y divide-line">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cx(GRID, "px-4 py-3")}>
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon={FileText}
              title="No reports yet"
              body="Ask for one in the chat — “generate a report on fleet serviceability” — and it will appear here."
              action={
                <Button onClick={() => navigate("/chat")}>
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  Go to chat
                </Button>
              }
            />
          </div>
        ) : (
          (["Today", "This week", "Earlier"] as const)
            .filter((k) => groups[k]?.length)
            // Column labels belong to the table, not to each group — repeating
            // them above every bucket reads as a new table each time.
            .map((k, groupIndex) => (
              <section key={k} className="mb-4 last:mb-0">
                <div className="surface-card divide-y divide-line">
                  <div className={cx(GRID, "tbl-head")}>
                    <span className="text-fg-low">{k}</span>
                    <span className="text-right">{groupIndex === 0 ? "Sections" : ""}</span>
                    <span className="text-right">{groupIndex === 0 ? "Sources" : ""}</span>
                    <span className="text-right">{groupIndex === 0 ? "Created" : ""}</span>
                  </div>
                  {groups[k].map((r) => (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/reports/${r.id}`)}
                      className={cx(
                        GRID,
                        "w-full px-4 py-2.5 text-left transition-colors duration-fast hover:bg-surface-2/60",
                      )}
                    >
                      <span className="truncate text-body text-fg-hi">{r.title}</span>
                      <span className="tabular text-right text-body text-fg-low">{r.sections}</span>
                      <span className="tabular text-right text-body text-fg-low">{r.sources}</span>
                      <span className="tabular whitespace-nowrap text-right text-body text-fg-low">
                        {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
        )}

        <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffset={setOffset} />
      </PageContainer>
    </PageTransition>
  );
}
