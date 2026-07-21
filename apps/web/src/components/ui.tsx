import { motion } from "framer-motion";
import clsx from "clsx";

export const cx = clsx;

/** Flat surface card — Binance-style elevated block. */
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
      className={cx(raised ? "surface-elevated" : "surface-card", glow && "shadow-glow", className)}
    >
      {children}
    </div>
  );
}

export function StatusLed({ tone = "ok", label }: { tone?: "ok" | "caution" | "critical" | "idle"; label?: string }) {
  const color = {
    ok: "status-led-ok",
    caution: "status-led-caution",
    critical: "status-led-critical",
    idle: "bg-fg-low shadow-none",
  }[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx("status-led", color)} />
      {label && <span className="stamp text-fg-low">{label}</span>}
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
    signal: "border-accent/40 text-accent bg-accent-surface",
  }[tone];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", tones, className)}>
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

/** Standard page header. */
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-4"
    >
      <div>
        <h1 className="font-sans text-2xl font-bold tracking-tight text-fg-hi sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-fg-low">{sub}</p>
      </div>
      {action}
    </motion.div>
  );
}

/** Primary CTA button (Binance yellow). */
export function HoloButton({
  children,
  variant = "primary",
  className,
  onClick,
  disabled,
  type = "button",
  title,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "secondary";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  title?: string;
  "aria-label"?: string;
}) {
  const variants = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    secondary: "btn-secondary",
  };
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={cx(variants[variant], className)}
    >
      {children}
    </motion.button>
  );
}

/** Flat input field. */
export function InputField({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("field", className)} {...rest} />;
}

/** Flat select. */
export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("field", className)} {...rest}>
      {children}
    </select>
  );
}

/** Data table row container. */
export function DataRow({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ backgroundColor: "rgba(252, 213, 53, 0.04)" }}
      onClick={onClick}
      className={cx(
        "grid items-center gap-4 border-b border-line px-4 py-3 text-sm transition-colors last:border-b-0",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
