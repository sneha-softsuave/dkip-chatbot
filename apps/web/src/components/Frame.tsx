import { useQuery } from "@tanstack/react-query";
import {
  Crosshair,
  FileBarChart,
  FileSearch,
  Gauge,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  ScrollText,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ClassificationBanner } from "./ClassificationBanner";
import { StatusLed, cx } from "./ui";

const NAV = [
  { to: "/ask", label: "Ask", icon: MessagesSquare, role: "any" },
  { to: "/sources", label: "Sources", icon: FileSearch, role: "any" },
  { to: "/summarize", label: "Summarize", icon: ScrollText, role: "any" },
  { to: "/reports", label: "Reports", icon: FileBarChart, role: "any" },
  { to: "/dashboards", label: "Fleet", icon: LayoutDashboard, role: "any" },
  { to: "/ingestion", label: "Ingest", icon: UploadCloud, role: "admin" },
  { to: "/audit", label: "Audit", icon: ShieldCheck, role: "admin" },
] as const;

export function Frame({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/health"),
    refetchInterval: 15000,
  });

  const banner = me?.classification_banner ?? "UNCLASSIFIED // FOR DEMONSTRATION";
  const provider = health.data?.checks?.provider;
  const storesOk = health.data?.status === "ok";

  return (
    <div className="flex h-full flex-col">
      <ClassificationBanner text={banner} edge="top" />

      <div className="flex min-h-0 flex-1">
        {/* Nav rail */}
        <nav className="flex w-[92px] shrink-0 flex-col items-stretch border-r border-line bg-surface-1/70 backdrop-blur">
          <div className="flex h-16 items-center justify-center border-b border-line">
            <Crosshair className="h-6 w-6 text-signal" strokeWidth={1.4} />
          </div>
          <div className="flex flex-1 flex-col gap-1 p-2">
            {NAV.filter((n) => n.role === "any" || me?.role === "admin").map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx(
                    "group relative flex flex-col items-center gap-1 rounded-[4px] py-2.5 text-fg-low transition-colors",
                    isActive ? "bg-signal/10 text-signal" : "hover:bg-surface-2 hover:text-fg-hi",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 w-0.5 rounded-r bg-signal" />}
                    <n.icon className="h-5 w-5" strokeWidth={1.5} />
                    <span className="font-display text-[10px] font-semibold uppercase tracking-wide">{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-line bg-surface-1/60 px-6 backdrop-blur">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-2xl font-bold tracking-wide text-fg-hi">DKIP</span>
              <span className="eyebrow hidden sm:block">Defense Knowledge Intelligence</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 md:flex">
                <StatusLed tone={provider ? "ok" : "idle"} />
                <span className="stamp text-fg-mid">
                  {provider ? `${provider.active ?? provider.configured} · ${provider.gen_model ?? ""}` : "provider…"}
                </span>
              </div>
              {me && (
                <div className="flex items-center gap-3 border-l border-line pl-4">
                  <div className="text-right">
                    <div className="font-display text-sm font-semibold leading-tight text-fg-hi">{me.name}</div>
                    <div className="stamp text-fg-low">
                      {me.role} · CLR-{me.clearance}
                    </div>
                  </div>
                  <button onClick={logout} className="btn-ghost !px-2 !py-2" title="Sign out" aria-label="Sign out">
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>

          {/* Status strip */}
          <footer className="flex h-8 items-center justify-between border-t border-line bg-surface-1/60 px-6 text-fg-low">
            <div className="flex items-center gap-4">
              <StatusLed tone={storesOk ? "ok" : "caution"} label={storesOk ? "stores nominal" : "stores degraded"} />
              <span className="stamp flex items-center gap-1">
                <Gauge className="h-3 w-3" /> {health.data?.status ?? "…"}
              </span>
            </div>
            <span className="stamp">DKIP POC1 · {me?.org_id ? "EME DEMO CMD" : ""}</span>
          </footer>
        </div>
      </div>

      <ClassificationBanner text={banner} edge="bottom" />
    </div>
  );
}
