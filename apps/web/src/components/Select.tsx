import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Lock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cx } from "./ui";

export interface SelectOption {
  value: string;
  label: string;
  /** The long form. Shown in the list, never in the closed trigger. */
  description?: string;
  icon?: React.ElementType;
}

/**
 * Listbox. Replaces the native `<select>`, which drew its option list with the
 * operating system — a light popup over a dark application, and the one part of
 * the interface no token could reach.
 *
 * Two shapes:
 *  - `field`  — a form control, matching `.field`
 *  - `inline` — plain type at rest that becomes a control on approach, for
 *               editable table cells
 *
 * Options are data rather than `<option>` children so a choice can carry a short
 * label for the trigger and a longer description for the list. The native
 * version had no such split, so explanatory option text ("Administrator — also
 * manages documents and people") ended up sitting in the closed field.
 */
export function Select({
  value,
  onChange,
  options,
  variant = "field",
  size = "md",
  disabled = false,
  lockedReason,
  align = "start",
  placeholder = "Select…",
  className,
  "aria-label": ariaLabel,
  id: idProp,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  variant?: "field" | "inline";
  size?: "sm" | "md";
  disabled?: boolean;
  /** Renders a lock and this explanation instead of a control. */
  lockedReason?: string;
  align?: "start" | "end";
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const reduce = useReducedMotion();
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ buffer: "", at: 0 });

  const selected = options.find((o) => o.value === value);
  // A value the caller holds but this list doesn't offer is still the truth —
  // show it rather than the placeholder, which would read as "nothing chosen"
  // and quietly misreport server state.
  const shown = selected?.label ?? (value || placeholder);

  // Close on any click that isn't ours. Pointerdown rather than click so the
  // list is gone before a click lands on whatever is underneath it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openList() {
    // Roughly how tall the list will be. Enough to decide which way to open
    // without measuring a node that hasn't rendered yet.
    const estimate = Math.min(options.length * (options.some((o) => o.description) ? 56 : 36) + 8, 288);
    const box = triggerRef.current?.getBoundingClientRect();
    setDropUp(!!box && box.bottom + estimate > window.innerHeight && box.top > estimate);
    setActive(Math.max(options.findIndex((o) => o.value === value), 0));
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1) {
      // Type-ahead. The buffer resets after a pause so "sa" finds "Standard"
      // but a later "s" starts again rather than searching "sas".
      const now = Date.now();
      typed.current.buffer = now - typed.current.at > 800 ? e.key : typed.current.buffer + e.key;
      typed.current.at = now;
      const q = typed.current.buffer.toLowerCase();
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(q));
      if (hit >= 0) setActive(hit);
    }
  }

  if (lockedReason) {
    return (
      <span
        title={lockedReason}
        className={cx(
          // Same box as the trigger it stands in for — a locked cell has to sit
          // on the same left edge as the editable ones above and below it, or
          // the column visibly steps in on whichever row happens to be yours.
          "-mx-2 flex items-center gap-1.5 px-2 py-1.5 text-body text-fg-low",
          variant === "field" && "h-[38px]",
          className,
        )}
      >
        <span className="min-w-0 truncate">{shown}</span>
        <Lock className="h-3 w-3 shrink-0 text-fg-dim" aria-hidden />
        <span className="sr-only">— {lockedReason}</span>
      </span>
    );
  }

  return (
    // No width of its own: `.field` is already `w-full`, so in a block or grid
    // cell the wrapper fills and the trigger fills with it, while in a flex row
    // it shrink-wraps to the label. A `w-full` here would fight every caller
    // that wants an auto-width filter.
    <div className={cx("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        data-open={open}
        className={cx(
          "group/sel",
          variant === "field" ? "field-trigger" : "select-inline",
          size === "sm" && variant === "field" && "px-2.5 py-1.5 text-label",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{shown}</span>
        <ChevronDown
          className={cx(
            "h-3.5 w-3.5 shrink-0 text-fg-dim transition-[transform,opacity] duration-fast",
            open && "rotate-180",
            variant === "inline" &&
              "opacity-0 group-hover/sel:opacity-100 group-focus-visible/sel:opacity-100 group-data-[open=true]/sel:opacity-100",
          )}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: dropUp ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: dropUp ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className={cx(
              "menu absolute z-40",
              dropUp ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {options.map((o, i) => {
              const Icon = o.icon;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={o.value === value}
                    data-active={i === active}
                    tabIndex={-1}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => commit(i)}
                    className="menu-item"
                  >
                    {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-dim" strokeWidth={1.75} aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-fg-hi">{o.label}</span>
                      {o.description && (
                        <span className="mt-0.5 block text-label leading-snug text-fg-dim">{o.description}</span>
                      )}
                    </span>
                    <Check
                      className={cx(
                        "mt-0.5 h-3.5 w-3.5 shrink-0 text-accent",
                        o.value !== value && "invisible",
                      )}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
