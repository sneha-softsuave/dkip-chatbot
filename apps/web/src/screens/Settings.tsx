import { Moon, Sun, User } from "lucide-react";

import { PageHeader, Panel } from "../components/ui";
import { useAuth } from "../lib/auth";

export function Settings() {
  const { me } = useAuth();

  function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.contains("dark");
    if (isDark) {
      html.classList.remove("dark");
      html.setAttribute("data-theme", "light");
      localStorage.setItem("dkip_theme", "light");
    } else {
      html.classList.add("dark");
      html.setAttribute("data-theme", "dark");
      localStorage.setItem("dkip_theme", "dark");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" sub="Application preferences and profile" />

      <Panel className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-fg-hi">Appearance</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="btn-secondary flex items-center gap-2"
          >
            <Sun className="h-4 w-4" />
            <Moon className="h-4 w-4" />
            Toggle Light / Dark Theme
          </button>
          <span className="text-xs text-fg-low">
            Dark tactical is the default. Light theme is available for high-ambient-light environments.
          </span>
        </div>
      </Panel>

      <Panel className="mt-4 p-5">
        <h3 className="mb-4 text-sm font-semibold text-fg-hi">Profile</h3>
        {me && (
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <User className="mt-0.5 h-5 w-5 text-fg-mid" />
              <div>
                <div className="font-medium text-fg-hi">{me.name}</div>
                <div className="text-fg-low">{me.subject}</div>
              </div>
            </div>
            <div className="ml-8 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
      </Panel>
    </div>
  );
}
