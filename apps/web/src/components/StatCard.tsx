import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { cx } from "./ui";

/**
 * The stat-card band every list screen opens with — the density device that
 * makes a screen feel full instead of a lone table in a void. Lifted from the
 * Admin console's KPI grid so all data screens share one language. The number
 * counts up on mount (a figure that lands reads as measured), and the card is
 * the same glass hero tile used elsewhere.
 */
function useCountUp(value: number) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const previous = useRef(0);
  useEffect(() => {
    if (reduce) return setShown(value);
    const controls = animate(previous.current, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return shown;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  className,
}: {
  icon?: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  className?: string;
}) {
  const shown = useCountUp(value);
  return (
    <div className={cx("glass card-lift rounded-lg p-4", className)}>
      <div className="flex items-center gap-2 text-fg-dim">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
        <span className="eyebrow">{label}</span>
      </div>
      <div className="tabular mt-1.5 text-h1 text-fg-hi">{shown.toLocaleString()}</div>
      {sub && <div className="mt-0.5 text-label text-fg-dim">{sub}</div>}
    </div>
  );
}

/** The 4-up (responsive) grid the stat cards sit in, above a screen's table. */
export function StatBand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>
  );
}
