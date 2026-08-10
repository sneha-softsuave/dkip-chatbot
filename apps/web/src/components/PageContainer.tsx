import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * Shared content column. Every screen used to declare its own `mx-auto max-w-*`,
 * so the column visibly jumped width when navigating routes. Two intentional
 * widths, and the page gutter lives here rather than on <main> — screens that
 * own their own scrolling (Chat) need the gutter at a different level.
 *
 *  - `default` → data, grids, tables
 *  - `narrow`  → single-column forms and reading
 */
export function PageContainer({
  children,
  size = "default",
  className,
}: {
  children: ReactNode;
  size?: "default" | "narrow";
  className?: string;
}) {
  // `narrow` is NOT centred: it keeps the same left edge as `default`, so the
  // content column doesn't slide sideways when you navigate between a table
  // screen and a form screen.
  return (
    <div className={cx("w-full px-6 pb-10 pt-6", size === "narrow" ? "max-w-3xl" : "mx-auto max-w-6xl", className)}>
      {children}
    </div>
  );
}
