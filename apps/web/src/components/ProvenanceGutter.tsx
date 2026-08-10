import type { ReactNode } from "react";
import type { Citation } from "../lib/types";
import { cx } from "./ui";

export type Provenance = "ok" | "caution" | "critical" | "idle";

/**
 * Where a claim came from, and whether it can be trusted:
 *
 *   ok        cited, and every source is current
 *   caution   cited, but a newer revision of a source exists
 *   critical  the assistant abstained — nothing supports this
 *   idle      no provenance claim (plans, scaffolding, plain replies)
 */
export function provenanceOf(input: { grounded?: boolean; citations?: Citation[] }): Provenance {
  if (input.grounded === false) return "critical";
  const citations = input.citations ?? [];
  if (!citations.length) return "idle";
  return citations.some((c) => c.superseded) ? "caution" : "ok";
}

/**
 * The signature device: a 2px margin rule carrying the state above. It is
 * reinforcement, never the only channel — every use pairs with text saying the
 * same thing, because colour alone isn't an accessible way to say "unsourced".
 */
/**
 * Written out in full rather than built as `gutter-${tone}`. Tailwind scans the
 * source for literal class names and drops component-layer rules it can't find,
 * so an interpolated name compiles away to nothing at build time.
 */
const TONE_CLASS: Record<Provenance, string> = {
  ok: "gutter-ok",
  caution: "gutter-caution",
  critical: "gutter-critical",
  idle: "gutter-idle",
};

export function Gutter({
  tone,
  children,
  className,
}: {
  tone: Provenance;
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("gutter", TONE_CLASS[tone], className)}>{children}</div>;
}
