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

const NAV_GENERAL = [
  { to: "/ask", label: "Ask", icon: MessagesSquare },
  { to: "/sources", label: "Document Library", icon: FileSearch },
  { to: "/summarize", label: "Summarize", icon: ScrollText },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/dashboards", label: "Fleet Readiness", icon: LayoutDashboard },
] as const;

const NAV_ADMIN = [
  { to: "/ingestion", label: "Ingestion", icon: UploadCloud },
  { to: "/audit", label: "Audit Log", icon: ShieldCheck },
  { to: "/admin", label: "Admin Console", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Gauge },
] as const;

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: React.ElementType }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-fast",
          isActive
            ? "border-l-2 border-l-accent bg-surface-2 font-medium text-fg-hi -ml-px"
            : "border-l-2 border-l-transparent text-fg-mid hover:bg-surface-2/60 hover:text-fg-hi",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {label}
    </NavLink>
  );
}

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
          <div className="flex flex-1 flex-col gap-0.5 overflow-auto p-2">
            <div className="mb-1 px-3 pt-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-fg-low">Navigation</div>
            {NAV_GENERAL.map((n) => <NavItem key={n.to} {...n} />)}
            {me?.role === "admin" && (
              <>
                <div className="mb-1 mt-3 px-3 pt-1 font-sans text-[10px] font-semibold uppercase tracking-widest text-fg-low">Administration</div>
                {NAV_ADMIN.map((n) => <NavItem key={n.to} {...n} />)}
              </>
            )}
            {me?.role !== "admin" && (
              <NavItem to="/settings" label="Settings" icon={Gauge} />
            )}
          </div>
        </nav>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Classification banner — top (§11.1) */}
          <div className="flex h-7 shrink-0 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.15em]"
               style={{ background: "var(--color-classification-banner)", color: "var(--color-classification-banner-fg)" }}>
            {me?.classification_banner || "UNCLASSIFIED // FOR DEMONSTRATION"}
          </div>
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

          {/* Classification banner — bottom */}
          <div className="flex h-6 shrink-0 items-center justify-center border-t border-line text-[10px] font-semibold uppercase tracking-[0.15em]"
               style={{ background: "var(--color-classification-banner)", color: "var(--color-classification-banner-fg)" }}>
            {me?.classification_banner || "UNCLASSIFIED // FOR DEMONSTRATION"}
          </div>
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
