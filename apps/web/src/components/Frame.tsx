import { useQuery } from "@tanstack/react-query";
import {
  FileBarChart,
  FileSearch,
  Gauge,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  ScrollText,
  Shield,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { StatusLed, cx } from "./ui";

const NAV = [
  { to: "/ask", label: "Ask", icon: MessagesSquare, role: "any" },
  { to: "/sources", label: "Documents", icon: FileSearch, role: "any" },
  { to: "/summarize", label: "Summarize", icon: ScrollText, role: "any" },
  { to: "/reports", label: "Reports", icon: FileBarChart, role: "any" },
  { to: "/dashboards", label: "Fleet Readiness", icon: LayoutDashboard, role: "any" },
  { to: "/ingestion", label: "Ingestion", icon: UploadCloud, role: "admin" },
  { to: "/audit", label: "Audit Log", icon: ShieldCheck, role: "admin" },
] as const;

export function Frame({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/health"),
    refetchInterval: 15000,
  });

  const provider = health.data?.checks?.provider;
  const storesOk = health.data?.status === "ok";

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="flex w-[220px] shrink-0 flex-col border-r border-line bg-surface-1">
          <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
            <Shield className="h-5 w-5 text-accent" strokeWidth={1.75} />
            <div className="leading-tight">
              <div className="font-sans text-sm font-semibold text-fg-hi">DKIP</div>
              <div className="text-[10px] text-fg-low">Defense Knowledge Intelligence</div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-0.5 p-2">
            {NAV.filter((n) => n.role === "any" || me?.role === "admin").map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-l-accent bg-surface-2 font-medium text-fg-hi"
                      : "border-l-transparent text-fg-mid hover:bg-surface-2/60 hover:text-fg-hi",
                  )
                }
              >
                <n.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {n.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-line bg-surface-1 px-6">
            <div className="flex items-center gap-2">
              <StatusLed tone={provider ? "ok" : "idle"} />
              <span className="stamp text-fg-mid">
                {provider ? `${provider.active ?? provider.configured} · ${provider.gen_model ?? ""}` : "connecting…"}
              </span>
            </div>
            {me && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-medium leading-tight text-fg-hi">{me.name}</div>
                  <div className="stamp text-fg-low">
                    {me.role} · Clearance {me.clearance}
                  </div>
                </div>
                <button onClick={logout} className="btn-ghost !px-2 !py-2" title="Sign out" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>

          {/* Status strip */}
          <footer className="flex h-8 items-center justify-between border-t border-line bg-surface-1 px-6 text-fg-low">
            <div className="flex items-center gap-4">
              <StatusLed tone={storesOk ? "ok" : "caution"} label={storesOk ? "Systems nominal" : "Systems degraded"} />
              <span className="stamp flex items-center gap-1">
                <Gauge className="h-3 w-3" /> {health.data?.status ?? "…"}
              </span>
            </div>
            <span className="stamp">DKIP POC1 {me?.org_id ? `· ${me.org_id}` : ""}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
