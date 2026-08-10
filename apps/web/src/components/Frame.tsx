import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Files,
  FolderTree,
  Gauge,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  UploadCloud,
  UsersRound,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { CommandPalette, useCommandPalette } from "./CommandPalette";
import { TopBar } from "./TopBar";
import { cx } from "./ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import type { ChatSessionMeta } from "../lib/types";

// The sign-in's wireframe corridor, reused as the whole shell's backdrop so the
// interior sits in the same lit space as the threshold. Lazy — it pulls in three
// — and dark-only, since the additive geometry has nothing to add on a light
// canvas. Chat owns its own tuned scene, so the shell layer stands down there to
// keep exactly one WebGL context per route.
const SignatureScene = lazy(() => import("./SignatureScene"));

const NAV = [
  { to: "/chat", label: "Chat", icon: MessagesSquare },
  { to: "/documents", label: "Documents", icon: Files },
  { to: "/reports", label: "Reports", icon: FileText },
] as const;

function NavItem({
  to,
  label,
  icon: Icon,
  collapsed,
  end,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  collapsed: boolean;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          "group flex h-9 items-center rounded-md text-body transition-colors duration-fast",
          collapsed ? "justify-center px-0" : "gap-3 px-3",
          isActive
            ? "bg-accent/12 font-medium text-accent"
            : "text-fg-low hover:bg-surface-2 hover:text-fg-hi",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

/**
 * Group heading. Collapsed there is no room for a word, so the group is marked
 * by a hairline instead — the grouping survives, the label doesn't.
 */
function NavGroup({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-6 bg-line" />;
  return <div className="px-3 pb-1 pt-5 text-micro uppercase text-fg-dim">{label}</div>;
}

/** Past conversations. The list endpoint has always existed; nothing called it. */
function RecentChats({ collapsed }: { collapsed: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sessions = useQuery<ChatSessionMeta[]>({
    queryKey: ["chat-sessions"],
    queryFn: () => api.get("/chat/sessions"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/chat/sessions/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      if (pathname === `/chat/${id}`) navigate("/chat");
    },
  });

  // Only conversations that got a title are worth listing — an empty session is
  // created on every visit to /chat, and listing those would be noise. The list
  // scrolls now, so the cap is generous rather than however many happened to fit.
  const named = (sessions.data ?? []).filter((s) => s.title && s.title !== "New chat").slice(0, 20);
  if (!named.length) return null;

  return (
    // The only scrolling region in the sidebar. It takes whatever height is left
    // and scrolls inside it, so a long history never pushes the fixed
    // destinations around and nothing has to be pinned to the bottom.
    <div className="flex min-h-0 flex-1 flex-col">
      <NavGroup label="Recent" collapsed={collapsed} />
      <div className="flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 pb-3">
      {named.map((s) => (
        <div key={s.id} className="group relative">
          <NavLink
            to={`/chat/${s.id}`}
            className={({ isActive }) =>
              cx(
                "flex h-8 items-center rounded-md pl-3 pr-8 text-body transition-colors duration-fast",
                isActive ? "bg-surface-3 text-fg-hi" : "text-fg-low hover:bg-surface-2 hover:text-fg-hi",
              )
            }
          >
            <span className="truncate">{s.title}</span>
          </NavLink>
          <button
            onClick={() => remove.mutate(s.id)}
            title={`Delete ${s.title}`}
            aria-label={`Delete ${s.title}`}
            className={cx(
              "absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-dim opacity-0 transition-opacity",
              "hover:text-critical focus-visible:opacity-100 group-hover:opacity-100",
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      </div>
    </div>
  );
}

export function Frame({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const still = useReducedMotion();
  const theme = useTheme();
  // The wireframe corridor is a DARK-theme device — on white the hard lines read
  // as scattered boxes, so light gets a soft gradient-mesh glow instead (below).
  // Chat brings its own scene; everywhere else the shell provides the depth.
  const showCorridor = theme === "dark" && !pathname.startsWith("/chat");
  const palette = useCommandPalette();
  const mainRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("dkip_nav_collapsed") === "1");

  function toggleNav() {
    setCollapsed((c) => {
      localStorage.setItem("dkip_nav_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  // Move focus to the content region on navigation so screen-reader and
  // keyboard users land on the new page instead of at the top of the sidebar.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="relative flex h-full overflow-hidden bg-bg">
      {/* Soft luminous depth behind the whole shell, BOTH themes — slow drifting
          blurred accent blobs (the moving "3D" that reads premium on white, where
          a wireframe would look like scattered lines). The faint grid and the
          WebGL corridor stay DARK-only; frosted chrome + card gaps let it through. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>
      {theme === "dark" && (
        <div className="ambient-grid pointer-events-none absolute inset-0" aria-hidden />
      )}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-body focus:font-medium focus:text-bg"
      >
        Skip to content
      </a>

      <motion.nav
        initial={false}
        animate={{ width: collapsed ? 60 : 232 }}
        transition={{ duration: still ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="glass-chrome relative z-10 flex shrink-0 flex-col border-r border-line"
        aria-label="Main"
      >
        <div
          className={cx(
            "flex h-14 shrink-0 items-center border-b border-line",
            collapsed ? "justify-center px-0" : "gap-2.5 px-4",
          )}
        >
          {/* The sign-in's glowing crest, at nav scale — the one spot of accent
              in the chrome, so the brand carries the same signal as the login. */}
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent-surface text-accent shadow-glow">
            <Shield className="h-4 w-4" strokeWidth={2} aria-hidden />
          </div>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-body font-semibold tracking-tight text-fg-hi">
                DKIP
              </span>
              <button
                onClick={toggleNav}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="rounded-md p-1.5 text-fg-dim transition-colors duration-fast hover:bg-surface-2 hover:text-fg-hi"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggleNav}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="mx-auto mt-3 rounded-md p-1.5 text-fg-dim transition-colors duration-fast hover:bg-surface-2 hover:text-fg-hi"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Everything is top-aligned in labelled groups. The admin destinations
            used to be pinned to the bottom with `mt-auto`, which opened a gap in
            the middle of the sidebar whose size depended on how many past
            conversations you happened to have — and left the group unlabelled,
            so its only meaning was "down there". */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={cx("flex flex-col gap-0.5 pt-3", collapsed ? "px-2" : "px-3")}>
            {NAV.map((n) => (
              <NavItem key={n.to} {...n} collapsed={collapsed} end={n.to === "/chat"} />
            ))}
          </div>

          {me?.role === "admin" && (
            <>
              <NavGroup label="Manage" collapsed={collapsed} />
              <div className={cx("flex flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>
                <NavItem to="/knowledge" label="Knowledge base" icon={UploadCloud} collapsed={collapsed} />
                <NavItem to="/admin" label="Admin console" icon={Gauge} collapsed={collapsed} />
                <NavItem to="/people" label="People" icon={UsersRound} collapsed={collapsed} />
                <NavItem to="/categories" label="Categories" icon={FolderTree} collapsed={collapsed} />
              </div>
            </>
          )}

          {!collapsed && <RecentChats collapsed={collapsed} />}
        </div>
      </motion.nav>

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        {/* The depth corridor, behind the transparent content. `isolate` keeps
            the -z layer local so it sits above the shell canvas but under the
            top bar and the page — the wireframe blooms through the gaps between
            opaque cards, exactly like the ambient field it deepens. */}
        {showCorridor && (
          <Suspense fallback={null}>
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
              <SignatureScene className="h-full w-full" spread={2.4} intensity={0.42} />
              <div className="shell-veil absolute inset-0" />
            </div>
          </Suspense>
        )}
        <TopBar onOpenSearch={() => palette.setOpen(true)} />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {children}
        </main>
      </div>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  );
}
