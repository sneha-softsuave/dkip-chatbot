import clsx from "clsx";

export const cx = clsx;

/** Flat surface card — the base container used throughout the app. */
export function Panel({
  children,
  className,
  raised,
  glow,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  raised?: boolean;
  glow?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(raised ? "panel-2" : "panel", glow && "shadow-pop", className)}
    >
      {children}
    </div>
  );
}

export function StatusLed({ tone = "ok", label }: { tone?: "ok" | "caution" | "critical" | "idle"; label?: string }) {
  const color = {
    ok: "bg-ok",
    caution: "bg-caution",
    critical: "bg-critical",
    idle: "bg-fg-low",
  }[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx("h-2 w-2 rounded-full", color)} />
      {label && <span className="stamp text-fg-mid">{label}</span>}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "caution" | "critical" | "signal";
  className?: string;
}) {
  const tones = {
    neutral: "border-line text-fg-mid",
    ok: "border-ok/40 text-ok bg-ok/10",
    caution: "border-caution/40 text-caution bg-caution/10",
    critical: "border-critical/40 text-critical bg-critical/10",
    signal: "border-accent/40 text-accent bg-accent/10",
  }[tone];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", tones, className)}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-md bg-surface-3", className)}>
      <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent", className)}
    />
  );
}

/** Standard page header — small muted label, clear title, optional action slot. */
export function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-4">
      <div>
        <h1 className="font-sans text-xl font-semibold text-fg-hi sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-fg-mid">{sub}</p>
      </div>
      {action}
    </div>
  );
}
