import { useQuery } from "@tanstack/react-query";
import { animate, motion, useReducedMotion } from "framer-motion";
import { FileText, MessageSquareQuote, ScrollText, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useChartTheme } from "../lib/chartTheme";
import { api } from "../lib/api";
import { useCollections, useDocKinds } from "../lib/taxonomy";
import { TiltCard } from "./TiltCard";
import { Skeleton, cx } from "./ui";

/** How far back the overview looks. The audit endpoint is a tail, not a range. */
const AUDIT_WINDOW = 500;

interface AuditEvent {
  action: string;
  actor: string;
  created_at: string;
  meta?: { grounded?: boolean };
}

const CLASS_LABEL: Record<string, string> = {
  UNCLASSIFIED: "Standard",
  RESTRICTED: "Restricted",
  CONFIDENTIAL: "Confidential",
};

/** Counts up to `value` on mount. A number that lands rather than appears reads
 *  as measured, and it draws the eye to the figure that matters. */
function Counter({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const previous = useRef(0);

  useEffect(() => {
    if (reduce) return setShown(value);
    const controls = animate(previous.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return <span className={cx("tabular", className)}>{shown.toLocaleString()}</span>;
}

/**
 * Buckets events for the activity chart.
 *
 * By hour when everything happened inside a couple of days, by day otherwise. A
 * fixed daily axis would draw a single bar on a freshly seeded deployment,
 * which reads as a broken chart rather than as a young one.
 */
function bucketActivity(events: AuditEvent[], windowed: boolean) {
  if (!events.length) return { points: [], unit: "hour" as const };
  const times = events.map((e) => new Date(e.created_at).getTime()).sort((a, b) => a - b);
  const spanHours = (times[times.length - 1] - times[0]) / 36e5;
  const byDay = spanHours > 48;

  const counts = new Map<number, number>();
  for (const t of times) {
    const d = new Date(t);
    if (byDay) d.setHours(0, 0, 0, 0);
    else d.setMinutes(0, 0, 0);
    counts.set(d.getTime(), (counts.get(d.getTime()) ?? 0) + 1);
  }

  const step = byDay ? 864e5 : 36e5;
  const keys = [...counts.keys()].sort((a, b) => a - b);
  const first = keys[0];
  const last = keys[keys.length - 1];
  const points: { label: string; events: number }[] = [];
  // Walk every slot in the range, not just the ones with events — gaps are
  // information, and skipping them would compress quiet periods out of view.
  for (let t = Math.max(first, last - step * (byDay ? 13 : 23)); t <= last; t += step) {
    const d = new Date(t);
    points.push({
      label: byDay
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : `${String(d.getHours()).padStart(2, "0")}:00`,
      events: counts.get(t) ?? 0,
    });
  }
  // When the request came back full, the oldest bucket holds only the slice of
  // that hour that fit inside the window — it under-reports, and drawn as-is it
  // is the tallest bar on the chart for the wrong reason. Drop it.
  if (windowed && points.length > 1) points.shift();
  return { points, unit: byDay ? ("day" as const) : ("hour" as const) };
}

export function ConsoleOverview() {
  const reduce = useReducedMotion();
  const chart = useChartTheme();
  const docKinds = useDocKinds();
  const collections = useCollections();
  const AXIS = { stroke: chart.axisText, fontSize: 11, fontFamily: "IBM Plex Mono" };
  const TOOLTIP = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 6,
    fontSize: 12,
    color: chart.tooltipText,
    boxShadow: chart.tooltipShadow,
  };
  const users = useQuery<{ subject: string; clearance: number }[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/users"),
  });
  const docs = useQuery({
    queryKey: ["documents", "all"],
    queryFn: () => api.get("/documents?limit=200").then((r) => r.items),
  });
  const reports = useQuery({
    queryKey: ["reports", "count"],
    queryFn: () => api.get("/reports?limit=200"),
  });
  const audit = useQuery<AuditEvent[]>({
    queryKey: ["audit", "overview"],
    queryFn: () => api.get(`/audit?limit=${AUDIT_WINDOW}`),
  });

  const loading = users.isLoading || docs.isLoading || reports.isLoading || audit.isLoading;

  const events = audit.data ?? [];
  const questions = events.filter((e) => e.action === "query");
  const traced = questions.filter((e) => e.meta?.grounded).length;
  const declined = questions.length - traced;
  const tracedPct = questions.length ? Math.round((traced / questions.length) * 100) : 0;

  const documents = (docs.data ?? []) as { doc_type: string; classification: string; collection?: string | null }[];
  const byKind = Object.entries(
    documents.reduce<Record<string, number>>((acc, d) => {
      acc[d.doc_type] = (acc[d.doc_type] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([kind, count]) => ({ label: docKinds.label(kind), count }))
    .sort((a, b) => b.count - a.count);
  const topKind = byKind[0]?.count ?? 1;

  const byArea = Object.entries(
    documents.reduce<Record<string, number>>((acc, d) => {
      const key = d.collection ?? "—unassigned";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([slug, count]) => ({ label: slug === "—unassigned" ? "Unassigned" : collections.label(slug), count }))
    .sort((a, b) => b.count - a.count);
  const topArea = byArea[0]?.count ?? 1;

  const bySensitivity = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL"]
    .map((c) => ({ label: CLASS_LABEL[c], count: documents.filter((d) => d.classification === c).length }))
    .filter((s) => s.count > 0);

  // The endpoint returns the most recent AUDIT_WINDOW events; when it comes back
  // full there is older activity the chart cannot see.
  const people = users.data ?? [];
  const byAccess = [
    { label: "Standard", count: people.filter((u) => u.clearance < 3).length, color: chart.sensitivity[0] },
    { label: "Full", count: people.filter((u) => u.clearance >= 3).length, color: chart.sensitivity[1] },
  ].filter((s) => s.count > 0);

  const { points, unit } = bucketActivity(events, events.length >= AUDIT_WINDOW);

  const stats = [
    { icon: Users, label: "People", value: people.length },
    { icon: FileText, label: "Documents", value: documents.length },
    { icon: ScrollText, label: "Reports", value: reports.data?.total ?? 0 },
    { icon: MessageSquareQuote, label: "Questions", value: questions.length },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-md" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduce ? 0 : i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className="space-y-4">
      {/* The thesis of the product, stated as a number: an answer either traces
          back to a document or it is refused. Declining is correct behaviour,
          so the two segments are accent and grey — not green and red. */}
      <motion.section {...rise(0)} className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-6 p-5 pb-4">
          <div className="min-w-0">
            <div className="eyebrow">Answers traced to a source</div>
            <div className="mt-2 flex items-baseline">
              <Counter value={tracedPct} className="text-display text-fg-hi" />
              <span className="text-display text-fg-low">%</span>
            </div>
            <p className="mt-2 max-w-prose text-body leading-relaxed text-fg-low">
              {traced.toLocaleString()} of {questions.length.toLocaleString()} questions were answered from cited
              passages. The rest were declined — the library held nothing that supported an answer, and saying so is
              the intended behaviour.
            </p>
          </div>
        </div>

        <Meter
          segments={[
            { label: "Traced", count: traced, color: chart.emphasis },
            { label: "Declined", count: declined, color: chart.context },
          ]}
          reduce={!!reduce}
        />
      </motion.section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} {...rise(i + 1)}>
            <TiltCard className="glass card-lift rounded-lg p-4">
              <div className="flex items-center gap-2 text-fg-dim">
                <s.icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                <span className="eyebrow">{s.label}</span>
              </div>
              <Counter value={s.value} className="mt-2 block text-h1 text-fg-hi" />
            </TiltCard>
          </motion.div>
        ))}
      </div>

      <motion.section {...rise(5)} className="surface-card p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-h2 text-fg-hi">Activity</h3>
          <span className="text-label text-fg-dim">
            {points.length} {unit === "day" ? "days" : "hours"} · last {AUDIT_WINDOW} recorded events
          </span>
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chart.emphasis} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chart.emphasis} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: chart.axisLine }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              <Tooltip
                contentStyle={TOOLTIP}
                cursor={{ stroke: chart.cursorLine, strokeWidth: 1 }}
                formatter={(v: number) => [v, "events"]}
              />
              <Area
                type="monotone"
                dataKey="events"
                stroke={chart.emphasis}
                strokeWidth={2}
                fill="url(#activityFill)"
                isAnimationActive={!reduce}
                animationDuration={700}
                dot={false}
                activeDot={{ r: 4, fill: chart.emphasis, stroke: chart.surface, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.section {...rise(6)} className="surface-card p-5">
          <h3 className="text-h2 text-fg-hi">Library by kind</h3>
          <p className="mt-1 text-label text-fg-dim">{documents.length} documents the assistant can answer from.</p>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={Math.max(byKind.length * 44, 120)}>
              <BarChart data={byKind} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ ...AXIS, fontFamily: "Inter" }}
                  axisLine={false}
                  tickLine={false}
                  width={96}
                />
                <Tooltip contentStyle={TOOLTIP} cursor={{ fill: chart.cursorFill }} />
                {/* Sequential, keyed to the value itself rather than to rank:
                    two kinds holding the same count must read as the same
                    colour. One hue, more-is-stronger, and length still does the
                    real work — the fill only reinforces it. */}
                <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={!reduce} animationDuration={700}
                     label={{ position: "right", fill: chart.labelText, fontSize: 11, fontFamily: "IBM Plex Mono" }}>
                  {byKind.map((d) => (
                    <Cell key={d.label} fill={chart.emphasis} fillOpacity={0.45 + 0.55 * (d.count / topKind)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.section {...rise(7)} className="surface-card p-5">
          <h3 className="text-h2 text-fg-hi">Library by knowledge area</h3>
          <p className="mt-1 text-label text-fg-dim">{documents.length} documents the assistant can answer from.</p>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={Math.max(byArea.length * 44, 120)}>
              <BarChart data={byArea} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ ...AXIS, fontFamily: "Inter" }}
                  axisLine={false}
                  tickLine={false}
                  width={96}
                />
                <Tooltip contentStyle={TOOLTIP} cursor={{ fill: chart.cursorFill }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={!reduce} animationDuration={700}
                     label={{ position: "right", fill: chart.labelText, fontSize: 11, fontFamily: "IBM Plex Mono" }}>
                  {byArea.map((d) => (
                    <Cell key={d.label} fill={chart.emphasis} fillOpacity={0.45 + 0.55 * (d.count / topArea)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      </div>

      {/* The two halves of the same fact: how sensitive the library is, and
          how many people are cleared for it. Either number alone invites the
          wrong conclusion. Full width now that it stands on its own row. */}
      <motion.section {...rise(8)} className="surface-card p-5">
        <h3 className="text-h2 text-fg-hi">Who can read what</h3>
        <p className="mt-1 text-label text-fg-dim">
          Access is applied inside every search, so a document above someone's level is never retrieved.
        </p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="eyebrow mb-3">Library by sensitivity</div>
            <Meter
              segments={bySensitivity.map((s, i) => ({ ...s, color: chart.sensitivity[i] ?? chart.context }))}
              reduce={!!reduce}
              inset
            />
          </div>
          <div>
            <div className="eyebrow mb-3">People by access</div>
            <Meter segments={byAccess} reduce={!!reduce} inset />
          </div>
        </div>
      </motion.section>
    </div>
  );
}

/**
 * Part-to-whole in one bar. Every segment is directly labelled with its name and
 * count: the darkest step of the sensitivity ramp sits at 2.63:1 against the
 * surface, and the validator treats that as relief-required rather than
 * dismissable — so the labels are load-bearing, not decoration.
 */
function Meter({
  segments,
  reduce,
  inset,
}: {
  segments: { label: string; count: number; color: string }[];
  reduce: boolean;
  inset?: boolean;
}) {
  const total = segments.reduce((n, s) => n + s.count, 0) || 1;
  return (
    <div className={inset ? undefined : "px-5 pb-5"}>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <motion.div
            key={s.label}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: reduce ? 0 : 0.25 + i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: `${(s.count / total) * 100}%`, background: s.color, transformOrigin: "left" }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="text-label text-fg-mid">{s.label}</span>
            <span className="tabular text-label text-fg-dim">
              {s.count} · {Math.round((s.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
