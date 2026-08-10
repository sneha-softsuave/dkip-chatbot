import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { Modal } from "./Modal";
import { Button, cx } from "./ui";

/**
 * Confirmation for an action that cannot be undone. `Modal` already owns the
 * backdrop, the spring and Escape, so this only adds the copy and the two
 * buttons — and the rule that the body must name the consequence rather than
 * ask "are you sure?", which tells the reader nothing they didn't know.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "default",
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "default" | "critical";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the action, not the dismissal: the reader has already decided by the
  // time they get here, and Escape is always available to back out.
  useEffect(() => {
    if (open) requestAnimationFrame(() => confirmRef.current?.focus());
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={title}
      panelClassName="w-full max-w-md rounded-xl border border-line-strong bg-surface-1 p-5 shadow-e3"
    >
      <h2 className="text-h2 text-fg-hi">{title}</h2>
      <div className="mt-2 text-body leading-relaxed text-fg-low">{body}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <button
          ref={confirmRef}
          onClick={onConfirm}
          disabled={loading}
          aria-busy={loading || undefined}
          className={cx(
            "btn",
            tone === "critical"
              ? "bg-critical text-bg shadow-e1 hover:bg-critical/85"
              : "btn-primary",
          )}
        >
          {loading ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
