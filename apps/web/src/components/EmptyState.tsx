import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * Shared empty state. An empty screen is an invitation to act, so every one of
 * these takes an action — and screens distinguish "nothing exists yet" from
 * "nothing matches your filters", because the way out is different.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2">
        <Icon className="h-5 w-5 text-fg-dim" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-h2 text-fg-hi">{title}</p>
      <p className="mt-1.5 max-w-sm text-body text-fg-low">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
