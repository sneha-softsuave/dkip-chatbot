import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, cx } from "./ui";

/**
 * Page control for the list screens. Says where you are in absolute terms
 * ("51–75 of 214") rather than only a page number, because on a filtered list
 * the total is the thing people are actually checking.
 *
 * Renders nothing when everything fits on one page — a control that can only be
 * disabled is noise.
 */
export function Pagination({
  total,
  limit,
  offset,
  onOffset,
  className,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (next: number) => void;
  className?: string;
}) {
  if (total <= limit) return null;

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const first = offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <nav className={cx("mt-4 flex items-center justify-between gap-4", className)} aria-label="Pagination">
      <p className="tabular text-label text-fg-dim">
        {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={offset === 0}
          onClick={() => onOffset(Math.max(0, offset - limit))}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Previous
        </Button>
        <span className="tabular px-1 text-label text-fg-low" aria-current="page">
          {page} / {pages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={last >= total}
          onClick={() => onOffset(offset + limit)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
