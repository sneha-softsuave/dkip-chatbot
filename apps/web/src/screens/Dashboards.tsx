import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader, Panel, cx } from "../components/ui";
import { api } from "../lib/api";

interface Fleet {
  kpi: { s?: number; u?: number; a?: number; t?: number };
  by_equipment: { equipment: string; serviceable: number; total: number }[];
  by_unit: { unit: string; serviceable: number; total: number }[];
}

const AXIS = { stroke: "var(--color-chart-5)", fontSize: 11, fontFamily: "IBM Plex Mono" };

export function Dashboards() {
  const fleet = useQuery<Fleet>({ queryKey: ["fleet"], queryFn: () => api.get("/dashboards/fleet") });
  const [filterUnit, setFilterUnit] = useState<string | null>(null);
  const k = fleet.data?.kpi ?? {};
  const readiness = k.t ? Math.round(((k.s ?? 0) / k.t) * 100) : 0;

  const byEquip = (fleet.data?.by_equipment ?? []).filter(
    (e) => !filterUnit || fleet.data?.by_unit.find((u: any) => u.unit === filterUnit)
  );

  const pieData = [
    { name: "Serviceable", value: k.s ?? 0, fill: "#5E9468" },
    { name: "Unserviceable", value: k.u ?? 0, fill: "#C53030" },
    { name: "Awaiting Spares", value: k.a ?? 0, fill: "#D4A017" },
  ].filter((d) => d.value > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Fleet Readiness" sub="Equipment status and serviceability metrics" />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total holdings" value={k.t} tone="text-fg-hi" />
        <Kpi label="Serviceable" value={k.s} tone="text-ok" />
        <Kpi label="Awaiting spares" value={k.a} tone="text-caution" />
        <Kpi label="Readiness" value={readiness} suffix="%" tone={readiness >= 75 ? "text-ok" : "text-caution"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="Serviceable vs. total — by equipment" data={byEquip} nameKey="equipment" />
        <Chart title="Serviceable vs. total — by unit" data={fleet.data?.by_unit ?? []} nameKey="unit" onBarClick={setFilterUnit} selected={filterUnit} />
      </div>

      {/* Pie chart + trend */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <div className="eyebrow mb-3">Fleet composition</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                   label={({ name, value }) => `${name}: ${value}`}
                   labelLine={{ stroke: "var(--color-chart-5)", strokeWidth: 1 }}>
                {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0D275C", border: "1px solid #2E4F85", borderRadius: 6, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel className="p-4">
          <div className="eyebrow mb-3">Readiness trend — by equipment</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={byEquip}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1F3A66" vertical={false} />
              <XAxis dataKey="equipment" tick={AXIS} axisLine={{ stroke: "#1F3A66" }} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ background: "#0D275C", border: "1px solid #2E4F85", borderRadius: 6, fontSize: 12 }} />
              <Line type="monotone" dataKey="serviceable" stroke="#5E9468" strokeWidth={2} dot={{ fill: "#5E9468", r: 3 }} />
              <Line type="monotone" dataKey="total" stroke="#4A7FB5" strokeWidth={2} dot={{ fill: "#4A7FB5", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <StructuredQuery />
    </div>
  );
}

function Kpi({ label, value, suffix, tone }: { label: string; value?: number; suffix?: string; tone: string }) {
  return (
    <Panel className="p-4">
      <div className="stamp text-fg-low">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>
        {value ?? "—"}
        {suffix && <span className="text-base">{suffix}</span>}
      </div>
    </Panel>
  );
}

function Chart({ title, data, nameKey, onBarClick, selected }: { title: string; data: any[]; nameKey: string; onBarClick?: (v: string | null) => void; selected?: string | null }) {
  return (
    <Panel className="p-4">
      <div className="eyebrow mb-3">{title}{selected && <span className="ml-2 text-accent">filtered: {selected}</span>}</div>
      {selected && (
        <button className="mb-2 text-[11px] text-accent hover:underline" onClick={() => onBarClick?.(null)}>Clear filter</button>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="2 4" stroke="#1F3A66" vertical={false} />
          <XAxis dataKey={nameKey} tick={AXIS} axisLine={{ stroke: "#1F3A66" }} tickLine={false}
                 onClick={(e: any) => onBarClick?.(e?.value)} cursor={onBarClick ? "pointer" : undefined} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            cursor={{ fill: "rgba(74,127,181,0.08)" }}
            contentStyle={{ background: "#0D275C", border: "1px solid #2E4F85", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "#CDDBE8" }}
          />
          <Bar dataKey="total" radius={[3, 3, 0, 0]} onClick={(e: any) => onBarClick?.(e?.[nameKey])} cursor={onBarClick ? "pointer" : undefined}>
            {data.map((_, i) => <Cell key={i} fill="#1F3A66" />)}
          </Bar>
          <Bar dataKey="serviceable" radius={[3, 3, 0, 0]} onClick={(e: any) => onBarClick?.(e?.[nameKey])} cursor={onBarClick ? "pointer" : undefined}>
            {data.map((_, i) => <Cell key={i} fill="#5E9468" />)}
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
        <Database className="h-4 w-4 text-accent" />
        <span className="eyebrow">Structured question · constrained read-only SQL</span>
      </div>
      <div className="flex gap-2">
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ask
        </button>
      </div>
      {error && <div className="mt-3 rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">{error}</div>}
      {res && (
        <div className="mt-4">
          <div className="stamp mb-1 text-fg-low">Generated SQL (whitelisted, read-only)</div>
          <pre className="overflow-x-auto rounded-md border border-line bg-surface-1 p-3 font-mono text-xs text-accent">{res.sql}</pre>
          <div className="stamp mb-1 mt-3 text-fg-low">Contributing rows — drill-down</div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-1 font-mono text-fg-low">
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
