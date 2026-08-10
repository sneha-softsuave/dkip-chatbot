import { useMemo } from "react";

import { useTheme } from "./theme";

/**
 * Chart colours, per theme. recharts takes literal colour strings (not CSS
 * custom properties), so a chart cannot resolve `--c-*` the way the rest of the
 * app does — it would stay dark on a light canvas. This is the one place colour
 * is spelled out, and it is keyed on the theme so `useChartTheme()` re-runs when
 * the toggle flips and every axis, grid, tooltip and series recolours with it.
 *
 * Two colours, not a categorical set: every chart is a single series or an
 * emphasis form (one thing in the accent, the rest in a de-emphasis grey), so
 * identity is carried by axis and direct labels, never by hue alone. The dark
 * values are the ones validated with the dataviz validator against the dark
 * chart surface (EMPHASIS/CONTEXT separate by ΔE ~22 under deuteranopia, both
 * clear 3:1). The light values mirror that intent off the light token ramp —
 * blues descend from the light accent #3B57CC, greys from the light neutrals.
 */
export interface ChartTheme {
  /** The accented series. */
  emphasis: string;
  /** The de-emphasis grey a second series or "declined"/"total" recedes into. */
  context: string;
  /** A darker track behind a value, and the muted second-series fill. */
  track: string;
  /** One-hue ramp, light → dark as a value/sensitivity rises. */
  sensitivity: [string, string, string];
  /** Five slices, told apart by lightness so they survive greyscale/CVD. */
  pie: string[];
  /** Axis tick text. */
  axisText: string;
  /** Axis line. */
  axisLine: string;
  /** Cartesian grid line. */
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipShadow: string;
  /** Hover cursor stroke (line/area charts). */
  cursorLine: string;
  /** Hover cursor fill (bar charts). */
  cursorFill: string;
  /** The surface the chart sits on — the active-dot cutout ring. */
  surface: string;
  /** Direct bar-label text. */
  labelText: string;
}

const DARK: ChartTheme = {
  emphasis: "#6E8BFF",
  context: "#5A6472",
  track: "#333941",
  sensitivity: ["#C3CCFF", "#6E8BFF", "#3A4FB8"],
  pie: ["#6E8BFF", "#4C6BE0", "#8993A3", "#5A6472", "#3A414B"],
  axisText: "#8A919C",
  axisLine: "#23272C",
  grid: "#23272C",
  tooltipBg: "#1A1D21",
  tooltipBorder: "#333941",
  tooltipText: "#F2F4F7",
  tooltipShadow: "0 16px 48px -8px rgba(0,0,0,0.6)",
  cursorLine: "#333941",
  cursorFill: "rgba(255,255,255,0.04)",
  surface: "#121417",
  labelText: "#9BA3AE",
};

const LIGHT: ChartTheme = {
  emphasis: "#3B57CC",
  context: "#7C8698",
  track: "#D6DCE5",
  sensitivity: ["#93A6EE", "#3B57CC", "#25316A"],
  pie: ["#3B57CC", "#2F49B0", "#8A93A3", "#5F6875", "#22336B"],
  axisText: "#5D6675",
  axisLine: "#D6DCE5",
  grid: "#E3E7ED",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#C7CDD8",
  tooltipText: "#0E1116",
  tooltipShadow: "0 16px 48px -8px rgba(15,23,42,0.16)",
  cursorLine: "#C7CDD8",
  cursorFill: "rgba(15,17,22,0.05)",
  surface: "#FFFFFF",
  labelText: "#4E5766",
};

export function useChartTheme(): ChartTheme {
  const theme = useTheme();
  return useMemo(() => (theme === "light" ? LIGHT : DARK), [theme]);
}
