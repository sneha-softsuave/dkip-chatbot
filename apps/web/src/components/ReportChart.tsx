import { useEffect, useRef } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { useChartTheme } from "../lib/chartTheme";
import type { ReportChartSpec } from "../lib/types";
import { cx } from "./ui";

/**
 * Renders a chart spec and hands the drawn SVG back as a PNG so exports carry
 * the same picture the user approved. Exports also embed the underlying table,
 * so a failed rasterization degrades to numbers rather than to nothing.
 */
export function ReportChart({
  spec,
  onImage,
  className,
}: {
  spec: ReportChartSpec;
  onImage?: (key: string, pngDataUrl: string) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chart = useChartTheme();

  useEffect(() => {
    if (!onImage || spec.type === "table") return;
    const id = window.setTimeout(() => {
      const svg = hostRef.current?.querySelector("svg");
      if (!svg) return;
      const { width, height } = svg.getBoundingClientRect();
      if (!width || !height) return;
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          onImage(spec.title, canvas.toDataURL("image/png"));
        } catch {
          /* tainted canvas — the export falls back to the data table */
        }
      };
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
    }, 700); // let the entry animation settle before snapshotting
    return () => window.clearTimeout(id);
  }, [spec, onImage]);

  if (spec.type === "table") {
    return (
      <div className={cx("overflow-x-auto rounded-md border border-line", className)}>
        <table className="w-full text-left text-body">
          <thead className="bg-surface-2 text-micro uppercase text-fg-dim">
            <tr>
              {(spec.columns ?? []).map((c) => (
                <th key={c} className="px-3 py-2 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(spec.rows ?? []).map((row, i) => (
              <tr key={i} className="border-t border-line text-fg-mid">
                {row.map((cell, j) => (
                  <td key={j} className={cx("px-3 py-2", j === 0 && "font-mono text-fg-low")}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const AXIS = { stroke: chart.axisText, fontSize: 11, fontFamily: "IBM Plex Mono" };
  const TOOLTIP = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 6,
    fontSize: 12,
    color: chart.tooltipText,
  };

  const points = spec.points ?? [];
  const series = spec.series ?? ["value"];
  // One accented series, everything else recedes — deliberately NOT the semantic
  // green/amber/red, which mean "cited / superseded / unsupported" elsewhere; a
  // chart is the largest block of colour on screen and would teach the wrong
  // thing. A colour the user asked for wins over the default; with two series the
  // second is drawn as the muted track so "make it maroon" keeps them distinct.
  const fill = (name: string, index: number) =>
    spec.color ? (index === 0 ? spec.color : chart.track) : name === "total" ? chart.track : chart.emphasis;

  return (
    <div ref={hostRef} className={className}>
      <ResponsiveContainer width="100%" height={240}>
        {spec.type === "pie" ? (
          <PieChart>
            <Pie data={points} dataKey="value" nameKey="label" cx="50%" cy="50%"
                 innerRadius={50} outerRadius={90} isAnimationActive={false}
                 label={({ name, value }) => `${name}: ${value}`}>
              {points.map((_, i) => (
                <Cell key={i} fill={spec.color && i === 0 ? spec.color : chart.pie[i % chart.pie.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP} />
          </PieChart>
        ) : spec.type === "line" ? (
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={TOOLTIP} />
            {series.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} strokeWidth={2}
                    stroke={fill(s, i)} isAnimationActive={false}
                    dot={{ fill: fill(s, i), r: 3 }} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={points} barGap={2}>
            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: chart.axisLine }} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={32} />
            <Tooltip cursor={{ fill: chart.cursorFill }} contentStyle={TOOLTIP} />
            {series.map((s, i) => (
              <Bar key={s} dataKey={s} radius={[3, 3, 0, 0]} isAnimationActive={false}
                   fill={fill(s, i)} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
