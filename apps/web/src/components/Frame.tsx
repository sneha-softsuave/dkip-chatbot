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
import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { GlassPanel } from "./GlassPanel";
import { Badge, StatusLed, cx } from "./ui";

const NAV_GENERAL = [
  { to: "/ask", label: "Ask", icon: MessagesSquare },
  { to: "/sources", label: "Library", icon: FileSearch },
  { to: "/summarize", label: "Summarize", icon: ScrollText },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/dashboards", label: "Fleet", icon: LayoutDashboard },
] as const;

const NAV_ADMIN = [
  { to: "/ingestion", label: "Ingestion", icon: UploadCloud },
  { to: "/audit", label: "Audit", icon: ShieldCheck },
  { to: "/admin", label: "Admin", icon: Shield },
  { to: "/settings", label: "Settings", icon: Gauge },
] as const;

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: React.ElementType }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-fast",
          isActive
            ? "bg-accent text-bg"
            : "text-fg-low hover:bg-surface-3 hover:text-fg-hi",
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
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
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {/* Flat dark sidebar */}
        <motion.nav
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="surface-card flex w-[220px] shrink-0 flex-col"
        >
          <div className="flex h-16 items-center gap-3 border-b border-line px-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-bg shadow-glow-sm">
              <Shield className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="leading-tight">
              <div className="font-sans text-sm font-bold tracking-wide text-fg-hi">DKIP</div>
              <div className="text-[9px] uppercase tracking-widest text-fg-low">Defense Intel</div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-auto p-3">
            <div className="mb-2 px-3 pt-2 font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-dim">Operations</div>
            {NAV_GENERAL.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
            {me?.role === "admin" && (
              <>
                <div className="mb-2 mt-4 px-3 pt-2 font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-dim">Command</div>
                {NAV_ADMIN.map((n) => (
                  <NavItem key={n.to} {...n} />
                ))}
              </>
            )}
            {me?.role !== "admin" && <NavItem to="/settings" label="Settings" icon={Gauge} />}
          </div>

          <div className="border-t border-line p-3">
            <div className="flex items-center gap-3 rounded-md bg-surface-1 p-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 font-mono text-xs font-bold text-accent">
                {me?.name?.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-fg-hi">{me?.name}</div>
                <div className="truncate text-[10px] text-fg-low">
                  {me?.role} · CLR-{me?.clearance}
                </div>
              </div>
              <button onClick={logout} className="btn-ghost !p-2" title="Sign out" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.nav>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Flat dark header */}
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="surface-card flex h-14 items-center justify-between px-5"
          >
            <div className="flex items-center gap-3">
              <Badge tone="signal">
                <StatusLed tone={provider ? "ok" : "idle"} />
                {provider ? `${provider.active ?? provider.configured}` : "connecting"}
              </Badge>
              <span className="stamp hidden text-fg-dim sm:inline">
                {provider?.gen_model ?? ""}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <GlassPanel className="flex items-center gap-2 px-3 py-1.5" hover={false} elevated>
                <StatusLed tone={storesOk ? "ok" : "caution"} />
                <span className="stamp text-fg-mid">{storesOk ? "Systems nominal" : "Systems degraded"}</span>
              </GlassPanel>
            </div>
          </motion.header>

          <main className="min-h-0 flex-1 overflow-auto rounded-xl bg-bg p-4">{children}</main>
        </div>
      </div>

    </div>
  );
}
