import { Monitor, Moon, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";

import { GlassPanel } from "../components/GlassPanel";
import { PageTransition } from "../components/PageTransition";
import { PageHeader, cx } from "../components/ui";
import { useAuth } from "../lib/auth";

export function Settings() {
  const { me } = useAuth();
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("dkip_theme") || "dark");

  function applyTheme(t: string) {
    setTheme(t);
    const html = document.documentElement;
    html.removeAttribute("data-theme");
    localStorage.setItem("dkip_theme", t);
    if (t === "light") {
      html.setAttribute("data-theme", "light");
    }
  }

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Settings" sub="Application preferences and profile" />

        <GlassPanel className="p-5" hover={false}>
          <h3 className="mb-4 text-sm font-semibold text-fg-hi">Appearance</h3>
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {(["dark", "light", "system"] as const).map((t) => {
                const active = theme === t;
                const Icon = t === "dark" ? Moon : t === "light" ? Sun : Monitor;
                return (
                  <button
                    key={t}
                    onClick={() => applyTheme(t)}
                    className={cx(
                      "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors duration-fast",
                      active
                        ? "border border-accent/40 bg-accent-surface font-medium text-fg-hi"
                        : "border border-line text-fg-mid hover:border-line-strong hover:text-fg-hi",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="mt-4 p-5" hover={false}>
          <h3 className="mb-4 text-sm font-semibold text-fg-hi">Profile</h3>
          {me && (
            <div className="space-y-2 text-sm">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-surface">
                  <User className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <div className="font-medium text-fg-hi">{me.name}</div>
                  <div className="text-fg-low">{me.subject}</div>
                </div>
              </div>
              <div className="ml-14 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-fg-low">Role: </span>
                  <span className="font-medium text-fg-hi uppercase">{me.role}</span>
                </div>
                <div>
                  <span className="text-fg-low">Clearance: </span>
                  <span className="font-medium text-fg-hi">Level {me.clearance}</span>
                </div>
                <div>
                  <span className="text-fg-low">Org: </span>
                  <span className="font-medium text-fg-hi">{me.org_id}</span>
                </div>
                <div>
                  <span className="text-fg-low">Classification: </span>
                  <span className="font-medium text-ok uppercase">{me.classification_banner}</span>
                </div>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>
    </PageTransition>
  );
}
