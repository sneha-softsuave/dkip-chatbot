import { LogOut, PenSquare, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { ThemeToggle } from "./ThemeToggle";
import { Button, cx } from "./ui";
import { useAuth } from "../lib/auth";

const SECTION: Record<string, string> = {
  chat: "Chat",
  documents: "Documents",
  reports: "Reports",
  knowledge: "Knowledge base",
  admin: "Admin console",
  people: "People",
  categories: "Categories",
};

/**
 * Persistent app bar: says where you are, and holds the two actions that make
 * sense from anywhere — search and starting a new chat.
 *
 * ponytail: the label is the section only, not a full breadcrumb trail. Detail
 * pages already carry their own back link, and a two-level crumb where the
 * second level is a title the bar would have to fetch isn't worth the wiring.
 */
export function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { me, logout } = useAuth();
  const section = SECTION[pathname.split("/")[1]] ?? "DKIP";
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="glass-chrome relative z-10 flex h-14 shrink-0 items-center gap-4 border-b border-line px-8">
      <h2 className="text-body font-medium text-fg-hi">{section}</h2>

      <button
        onClick={onOpenSearch}
        className={cx(
          "group ml-auto flex w-64 items-center gap-2 rounded-md border border-line bg-surface-1 px-3 py-1.5",
          "text-body text-fg-dim transition-colors duration-fast hover:border-line-strong hover:text-fg-low",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-micro text-fg-dim">
          {mac ? "⌘" : "Ctrl "}K
        </kbd>
      </button>

      <Button variant="ghost" size="sm" onClick={() => navigate("/chat")}>
        <PenSquare className="h-3.5 w-3.5" aria-hidden />
        New chat
      </Button>

      <ThemeToggle />

      <div className="flex items-center gap-3 border-l border-line pl-4">
        <div className="text-right leading-tight">
          <div className="text-label text-fg-mid">{me?.name}</div>
          <div className="text-micro text-fg-dim">{me?.role === "admin" ? "Administrator" : "Analyst"}</div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          aria-label="Sign out"
          className="rounded-md p-2 text-fg-dim transition-colors duration-fast hover:bg-surface-2 hover:text-fg-hi"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
