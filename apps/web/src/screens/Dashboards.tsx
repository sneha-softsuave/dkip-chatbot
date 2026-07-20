import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel } from "../components/ui";
import { Header } from "./Sources";
import { api } from "../lib/api";

interface Fleet {
  kpi: { s?: number; u?: number; a?: number; t?: number };
  by_equipment: { equipment: string; serviceable: number; total: number }[];
  by_unit: { unit: string; serviceable: number; total: number }[];
}

const AXIS = { stroke: "#64788C", fontSize: 11, fontFamily: "IBM Plex Mono" };

export function Dashboards() {
  const fleet = useQuery<Fleet>({ queryKey: ["fleet"], queryFn: () => api.get("/dashboards/fleet") });
  const k = fleet.data?.kpi ?? {};
  const readiness = k.t ? Math.round(((k.s ?? 0) / k.t) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <Header title="Fleet Readiness" sub="Aggregates over structured corpus data" />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total Holdings" value={k.t} tone="text-fg-hi" />
        <Kpi label="Serviceable" value={k.s} tone="text-ok" />
        <Kpi label="Awaiting Spares" value={k.a} tone="text-caution" />
        <Kpi label="Readiness" value={readiness} suffix="%" tone={readiness >= 75 ? "text-ok" : "text-caution"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="Serviceable vs Total — by equipment" data={fleet.data?.by_equipment ?? []} nameKey="equipment" />
        <Chart title="Serviceable vs Total — by unit" data={fleet.data?.by_unit ?? []} nameKey="unit" />
      </div>

      <StructuredQuery />
    </div>
  );
}

function Kpi({ label, value, suffix, tone }: { label: string; value?: number; suffix?: string; tone: string }) {
  return (
    <Panel className="p-4">
      <div className="stamp text-fg-low">{label}</div>
      <div className={`mt-1 font-display text-3xl font-bold ${tone}`}>
        {value ?? "—"}
        {suffix && <span className="text-lg">{suffix}</span>}
      </div>
    </Panel>
  );
}

function Chart({ title, data, nameKey }: { title: string; data: any[]; nameKey: string }) {
  return (
    <Panel className="p-4">
      <div className="eyebrow mb-3">{title}</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="2 4" stroke="#223040" vertical={false} />
          <XAxis dataKey={nameKey} tick={AXIS} axisLine={{ stroke: "#223040" }} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            cursor={{ fill: "rgba(44,224,196,0.06)" }}
            contentStyle={{ background: "#0F151C", border: "1px solid #2E4256", borderRadius: 3, fontSize: 12 }}
            labelStyle={{ color: "#9FB0C0" }}
          />
          <Bar dataKey="total" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill="#1C2733" />)}
          </Bar>
          <Bar dataKey="serviceable" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill="#2CE0C4" />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function StructuredQuery() {
  const [q, setQ] = useState("How many 5-tonne recovery vehicles are serviceable in 12 Corps?");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ sql: string; rows: any[] } | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setRes(null);
    try {
      setRes(await api.post("/structured/query", { question: q }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mt-4 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-signal" />
        <span className="eyebrow">Structured question · constrained read-only SQL</span>
      </div>
      <div className="flex gap-2">
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ask
        </button>
      </div>
      {error && <div className="mt-3 rounded-[3px] border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">{error}</div>}
      {res && (
        <div className="mt-4">
          <div className="stamp mb-1 text-fg-low">Generated SQL (whitelisted, read-only)</div>
          <pre className="overflow-x-auto rounded-[3px] border border-line bg-ink/60 p-3 font-mono text-xs text-signal">{res.sql}</pre>
          <div className="stamp mb-1 mt-3 text-fg-low">Contributing rows — drill-down</div>
          <div className="overflow-x-auto rounded-[3px] border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 font-mono text-fg-low">
                <tr>{res.rows[0] && Object.keys(res.rows[0]).map((h) => <th key={h} className="px-3 py-2 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody>
                {res.rows.map((row, i) => (
                  <tr key={i} className="border-t border-line font-mono text-fg-hi">
                    {Object.values(row).map((v, j) => <td key={j} className="px-3 py-1.5">{String(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
