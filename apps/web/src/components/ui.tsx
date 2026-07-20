import clsx from "clsx";

export const cx = clsx;

/** Instrument panel — a raised hairline-bordered surface with corner reticle
 *  ticks. The reticles are the signature chrome that reads as a targeting /
 *  drawing frame rather than a generic card. */
export function Panel({
  children,
  className,
  raised,
  glow,
  reticle = true,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  raised?: boolean;
  glow?: boolean;
  reticle?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(
        raised ? "panel-2" : "panel",
        "shadow-panel",
        glow && "shadow-glow",
        className,
      )}
    >
      {reticle && <Reticles />}
      {children}
    </div>
  );
}

function Reticles() {
  const base = "pointer-events-none absolute h-2.5 w-2.5 border-signal/50";
  return (
    <>
      <span className={cx(base, "left-[-1px] top-[-1px] border-l border-t")} />
      <span className={cx(base, "right-[-1px] top-[-1px] border-r border-t")} />
      <span className={cx(base, "bottom-[-1px] left-[-1px] border-b border-l")} />
      <span className={cx(base, "bottom-[-1px] right-[-1px] border-b border-r")} />
    </>
  );
}

export function StatusLed({ tone = "ok", label }: { tone?: "ok" | "caution" | "critical" | "idle"; label?: string }) {
  const color = {
    ok: "bg-ok shadow-[0_0_8px_#35C46B]",
    caution: "bg-caution shadow-[0_0_8px_#E3A72C]",
    critical: "bg-critical shadow-[0_0_8px_#E5484D]",
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
    signal: "border-signal/40 text-signal bg-signal/10",
  }[tone];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", tones, className)}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-[3px] bg-surface-2", className)}>
      <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-signal", className)}
    />
  );
}
