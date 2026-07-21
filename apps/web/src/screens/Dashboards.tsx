import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { GlassPanel } from "../components/GlassPanel";
import { PageTransition, StaggerContainer, StaggerItem } from "../components/PageTransition";
import { HoloButton, InputField, PageHeader, cx } from "../components/ui";
import { api } from "../lib/api";

interface Fleet {
  kpi: { s?: number; u?: number; a?: number; t?: number };
  by_equipment: { equipment: string; serviceable: number; total: number }[];
  by_unit: { unit: string; serviceable: number; total: number }[];
}

const AXIS = { stroke: "#707a8a", fontSize: 11, fontFamily: "IBM Plex Mono" };
const TOOLTIP = { background: "#1e2329", border: "1px solid #2b3139", borderRadius: 8, fontSize: 12 };

export function Dashboards() {
  const fleet = useQuery<Fleet>({ queryKey: ["fleet"], queryFn: () => api.get("/dashboards/fleet") });
  const [filterUnit, setFilterUnit] = useState<string | null>(null);
  const k = fleet.data?.kpi ?? {};
  const readiness = k.t ? Math.round(((k.s ?? 0) / k.t) * 100) : 0;

  const byEquip = (fleet.data?.by_equipment ?? []).filter(
    (e) => !filterUnit || fleet.data?.by_unit.find((u: any) => u.unit === filterUnit)
  );

  const pieData = [
    { name: "Serviceable", value: k.s ?? 0, fill: "#0ecb81" },
    { name: "Unserviceable", value: k.u ?? 0, fill: "#f6465d" },
    { name: "Awaiting Spares", value: k.a ?? 0, fill: "#FCD535" },
  ].filter((d) => d.value > 0);

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Fleet Readiness" sub="Equipment status and serviceability metrics" />

        <StaggerContainer className="relative z-10 mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StaggerItem>
            <Kpi label="Total holdings" value={k.t} tone="text-fg-hi" />
          </StaggerItem>
          <StaggerItem>
            <Kpi label="Serviceable" value={k.s} tone="text-ok" />
          </StaggerItem>
          <StaggerItem>
            <Kpi label="Awaiting spares" value={k.a} tone="text-caution" />
          </StaggerItem>
          <StaggerItem>
            <Kpi label="Readiness" value={readiness} suffix="%" tone={readiness >= 75 ? "text-ok" : "text-caution"} />
          </StaggerItem>
        </StaggerContainer>

        <div className="relative z-10 grid gap-4 lg:grid-cols-2">
          <Chart title="Serviceable vs. total — by equipment" data={byEquip} nameKey="equipment" />
          <Chart title="Serviceable vs. total — by unit" data={fleet.data?.by_unit ?? []} nameKey="unit" onBarClick={setFilterUnit} selected={filterUnit} />
        </div>

        <div className="relative z-10 mt-4 grid gap-4 lg:grid-cols-2">
          <GlassPanel className="p-4" hover={false}>
            <div className="eyebrow text-accent mb-3">Fleet composition</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: "#707a8a", strokeWidth: 1 }}
                >
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          </GlassPanel>
          <GlassPanel className="p-4" hover={false}>
            <div className="eyebrow text-accent mb-3">Readiness trend — by equipment</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byEquip}>
                <CartesianGrid strokeDasharray="2 4" stroke="#2b3139" vertical={false} />
                <XAxis dataKey="equipment" tick={AXIS} axisLine={{ stroke: "#2b3139" }} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={TOOLTIP} />
                <Line type="monotone" dataKey="serviceable" stroke="#0ecb81" strokeWidth={2} dot={{ fill: "#0ecb81", r: 3 }} />
                <Line type="monotone" dataKey="total" stroke="#FCD535" strokeWidth={2} dot={{ fill: "#FCD535", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </GlassPanel>
        </div>

        <StructuredQuery />
      </div>
    </PageTransition>
  );
}

function Kpi({ label, value, suffix, tone }: { label: string; value?: number; suffix?: string; tone: string }) {
  return (
    <GlassPanel className="p-4" hover={false}>
      <div className="stamp text-fg-low">{label}</div>
      <div className={cx("mt-1 text-2xl font-bold font-mono tracking-tight", tone)}>
        {value ?? "—"}
        {suffix && <span className="text-base">{suffix}</span>}
      </div>
    </GlassPanel>
  );
}

function Chart({
  title,
  data,
  nameKey,
  onBarClick,
  selected,
}: {
  title: string;
  data: any[];
  nameKey: string;
  onBarClick?: (v: string | null) => void;
  selected?: string | null;
}) {
  return (
    <GlassPanel className="p-4" hover={false}>
      <div className="eyebrow text-accent mb-3">
        {title}
        {selected && <span className="ml-2 text-fg-mid">filtered: {selected}</span>}
      </div>
      {selected && (
        <button className="mb-2 text-[11px] text-accent hover:underline" onClick={() => onBarClick?.(null)}>
          Clear filter
        </button>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="2 4" stroke="#2b3139" vertical={false} />
          <XAxis
            dataKey={nameKey}
            tick={AXIS}
            axisLine={{ stroke: "#2b3139" }}
            tickLine={false}
            onClick={(e: any) => onBarClick?.(e?.value)}
            cursor={onBarClick ? "pointer" : undefined}
          />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} />
          <Tooltip cursor={{ fill: "rgba(252, 213, 53, 0.05)" }} contentStyle={TOOLTIP} />
          <Bar dataKey="total" radius={[3, 3, 0, 0]} onClick={(e: any) => onBarClick?.(e?.[nameKey])} cursor={onBarClick ? "pointer" : undefined}>
            {data.map((_, i) => (
              <Cell key={i} fill="#2b3139" />
            ))}
          </Bar>
          <Bar dataKey="serviceable" radius={[3, 3, 0, 0]} onClick={(e: any) => onBarClick?.(e?.[nameKey])} cursor={onBarClick ? "pointer" : undefined}>
            {data.map((_, i) => (
              <Cell key={i} fill="#0ecb81" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassPanel>
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
    <GlassPanel className="relative z-10 mt-4 p-5" hover={false}>
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-accent" />
        <span className="eyebrow text-accent">Structured question · constrained read-only SQL</span>
      </div>
      <div className="flex gap-2">
        <InputField value={q} onChange={(e) => setQ(e.target.value)} />
        <HoloButton onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ask
        </HoloButton>
      </div>
      {error && <div className="mt-3 rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">{error}</div>}
      {res && (
        <div className="mt-4">
          <div className="stamp mb-1 text-fg-low">Generated SQL (whitelisted, read-only)</div>
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface-1 p-3 font-mono text-xs text-accent">{res.sql}</pre>
          <div className="stamp mb-1 mt-3 text-fg-low">Contributing rows — drill-down</div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-1 font-mono text-fg-low">
                <tr>
                  {res.rows[0] &&
                    Object.keys(res.rows[0]).map((h) => (
                      <th key={h} className="px-3 py-2 uppercase">
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {res.rows.map((row, i) => (
                  <tr key={i} className="border-t border-line font-mono text-fg-hi">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-1.5">
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
