import { useQuery } from "@tanstack/react-query";
import { FileText, Files, MessagesSquare, Search, Settings as SettingsIcon, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Modal } from "./Modal";
import { cx } from "./ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ChatSessionMeta, DocumentMeta, ReportListItem } from "../lib/types";

interface Item {
  id: string;
  group: "Go to" | "Documents" | "Reports" | "Chats";
  label: string;
  hint?: string;
  icon: React.ElementType;
  to: string;
}

/**
 * Subsequence match. Scores contiguous runs and word-start hits higher, so
 * "arv" ranks "ARV-5 Manual" above "Hydraulic Recovery Vehicle". Returns null
 * when the query isn't a subsequence at all, which is also the filter.
 *
 * ponytail: 15 lines instead of a fuzzy-search dependency. If ranking quality
 * ever matters more than bundle size, swap in `fuse.js` behind this signature.
 */
function score(text: string, query: string): number | null {
  const t = text.toLowerCase();
  let cursor = 0;
  let total = 0;
  let run = 0;
  for (const ch of query) {
    const at = t.indexOf(ch, cursor);
    if (at < 0) return null;
    run = at === cursor ? run + 1 : 0;
    const wordStart = at === 0 || /[\s\-_/.]/.test(t[at - 1]);
    total += 1 + run * 2 + (wordStart ? 3 : 0);
    cursor = at + 1;
  }
  return total - text.length * 0.01; // mild preference for tighter matches
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Same query keys as the screens, so the palette reads their cache rather
  // than refetching. `enabled` keeps it from fetching until first opened.
  const docs = useQuery<DocumentMeta[]>({
    queryKey: ["documents", "all"],
    queryFn: () => api.get("/documents?limit=200").then((r) => r.items),
    enabled: open,
  });
  const reports = useQuery<ReportListItem[]>({
    queryKey: ["reports", "all"],
    queryFn: () => api.get("/reports?limit=200").then((r) => r.items),
    enabled: open,
  });
  const sessions = useQuery<ChatSessionMeta[]>({
    queryKey: ["chat-sessions"],
    queryFn: () => api.get("/chat/sessions"),
    enabled: open,
  });

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: "nav-chat", group: "Go to", label: "Chat", icon: MessagesSquare, to: "/chat" },
      { id: "nav-docs", group: "Go to", label: "Documents", icon: Files, to: "/documents" },
      { id: "nav-reports", group: "Go to", label: "Reports", icon: FileText, to: "/reports" },
      ...(me?.role === "admin"
        ? [{ id: "nav-kb", group: "Go to" as const, label: "Knowledge base", icon: UploadCloud, to: "/knowledge" }]
        : []),
      { id: "nav-settings", group: "Go to", label: "Settings", icon: SettingsIcon, to: "/settings" },
    ];
    return [
      ...nav,
      ...(docs.data ?? []).map((d) => ({
        id: `doc-${d.id}`,
        group: "Documents" as const,
        label: d.title,
        hint: d.doc_code,
        icon: Files,
        to: "/documents",
      })),
      ...(reports.data ?? []).map((r) => ({
        id: `rep-${r.id}`,
        group: "Reports" as const,
        label: r.title,
        icon: FileText,
        to: `/reports/${r.id}`,
      })),
      ...(sessions.data ?? []).map((s) => ({
        id: `chat-${s.id}`,
        group: "Chats" as const,
        label: s.title || "Untitled chat",
        icon: MessagesSquare,
        to: `/chat/${s.id}`,
      })),
    ];
  }, [docs.data, reports.data, sessions.data, me?.role]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .map((item) => {
        const s = score(`${item.label} ${item.hint ?? ""}`, q);
        return s === null ? null : { item, s };
      })
      .filter((x): x is { item: Item; s: number } => x !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.item);
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  // Reset the query each time it opens — a palette that remembers the last
  // search makes the second visit feel broken.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item?: Item) {
    if (!item) return;
    navigate(item.to);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  }

  let lastGroup = "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Search DKIP"
      panelClassName="w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-surface-1 shadow-e3"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 focus-within:border-accent/70">
        <Search className="h-4 w-4 shrink-0 text-fg-dim" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search documents, reports and chats…"
          aria-label="Search documents, reports and chats"
          className="w-full bg-transparent py-3.5 text-body text-fg-hi placeholder:text-fg-dim [&:focus-visible]:outline-none"
        />
      </div>

      <div ref={listRef} className="max-h-[22rem] overflow-y-auto p-2" role="listbox">
        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-body text-fg-low">
            Nothing matches “{query}”.
          </p>
        ) : (
          results.map((item, i) => {
            const header = item.group !== lastGroup ? ((lastGroup = item.group), item.group) : null;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {header && <div className="px-3 pb-1 pt-3 text-micro uppercase text-fg-dim">{header}</div>}
                <button
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-fast",
                    i === active ? "bg-surface-3 text-fg-hi" : "text-fg-mid",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-fg-dim" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-body">{item.label}</span>
                  {item.hint && <span className="stamp shrink-0">{item.hint}</span>}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-micro text-fg-dim">
        <span>↑↓ to move</span>
        <span>↵ to open</span>
        <span>esc to close</span>
      </div>
    </Modal>
  );
}

/** ⌘K / Ctrl-K, owned here so the shell doesn't repeat the listener. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
