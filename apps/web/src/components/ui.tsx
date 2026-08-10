import { Eye, EyeOff, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";

export const cx = clsx;

/**
 * Status marker. Tones map to the semantic set, never to `accent` — a badge is
 * always saying something about state, and accent means "interactive".
 */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "caution" | "critical";
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-surface-2 text-fg-low",
    ok: "border-ok/30 bg-ok/10 text-ok",
    caution: "border-caution/30 bg-caution/10 text-caution",
    critical: "border-critical/30 bg-critical/10 text-critical",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-label",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-sm bg-surface-2", className)}>
      <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-fg-low", className)}
    />
  );
}

/**
 * Page title block. The interior's answer to the sign-in header: an optional
 * glowing accent crest and a tracked eyebrow carry the same command-deck signal
 * inside the app, and the title sits at the `display` tier so hierarchy is size,
 * not colour. `hero` (48px) stays login-only; screens step down to `display`.
 * `icon`/`eyebrow` are optional, so every existing caller keeps working.
 */
export function PageHeader({
  title,
  sub,
  action,
  eyebrow,
  icon: Icon,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  /** Tracked micro-label above the title. */
  eyebrow?: string;
  /** Rendered as the glowing crest beside the title. */
  icon?: React.ElementType;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-6">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span
            aria-hidden
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent-surface text-accent"
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
          <h1 className="text-title text-fg-hi">{title}</h1>
          {sub && <p className="mt-1 max-w-prose text-body text-fg-low">{sub}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * The one button. `primary` is accent-filled and there should be exactly one
 * visible per screen; everything else is `ghost` (bordered) or `secondary`
 * (bare). Hover shifts colour and elevation only — never size, which would
 * nudge neighbouring layout.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "secondary" | "hero";
  size?: "sm" | "md";
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    secondary: "btn-secondary",
    hero: "btn-hero",
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(variants[variant], size === "sm" && "px-2.5 py-1.5 text-label", className)}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/**
 * Text input. With no `icon` it is the plain `.field` every existing caller
 * already uses; pass one and it becomes the divided icon-led control, with the
 * focus treatment moving to the wrapper so the ring surrounds the whole thing.
 */
export function InputField({
  className,
  icon: Icon,
  trailing,
  ...rest
}: {
  icon?: React.ElementType;
  /** Rendered in a matching cell on the right — used for the password toggle. */
  trailing?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  if (!Icon && !trailing) return <input className={cx("field", className)} {...rest} />;
  return (
    <div className={cx("field-group", className)}>
      {Icon && (
        <span className="field-affix border-r border-line" aria-hidden>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
      <input {...rest} />
      {trailing}
    </div>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordField({
  icon,
  className,
  ...rest
}: { icon?: React.ElementType } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <InputField
      {...rest}
      icon={icon}
      className={className}
      type={shown ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          title={shown ? "Hide password" : "Show password"}
          className="field-affix border-l border-line transition-colors duration-fast hover:text-fg-hi"
        >
          {shown ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
        </button>
      }
    />
  );
}

/**
 * Small identity tile. Initials, not a photo — there are no avatars to load,
 * and a coloured circle per person would break a near-monochrome interface.
 * The tint comes from the `accent` identity ramp, which exists to tell people
 * apart and carries no status meaning.
 */
export function Monogram({
  name,
  tone = "soft",
  size = "md",
  className,
}: {
  name: string;
  tone?: "accent" | "soft" | "pale";
  size?: "md" | "lg";
  className?: string;
}) {
  // Last two name parts, after dropping any parenthetical — the seeded accounts
  // read "Maj. A. Rao (Admin)", and taking the final two words off that gives
  // "RA" rather than "AR". Rank prefixes fall away on their own.
  const initials =
    name
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^\p{L}\p{N}\s.]/gu, " ")
      .split(/[\s.]+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const tones = {
    accent: "border-accent/30 bg-accent/[0.14] text-accent",
    soft: "border-accent-soft/25 bg-accent-soft/[0.12] text-accent-soft",
    pale: "border-accent-pale/25 bg-accent-pale/[0.10] text-accent-pale",
  }[tone];
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-md border font-medium",
        size === "lg" ? "h-12 w-12 text-body" : "h-8 w-8 text-label",
        tones,
        className,
      )}
    >
      {initials}
    </span>
  );
}

