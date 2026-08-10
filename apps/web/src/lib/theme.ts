import { useSyncExternalStore } from "react";

/**
 * Theme is a single attribute on <html> — `data-theme="light" | "dark"` — which
 * index.css reads to pick a token block, and a matching key in localStorage so
 * the choice survives a reload. index.html stamps the attribute before first
 * paint (from storage, else the OS preference), so there is no flash of the
 * wrong theme before React mounts; this module only handles changing it.
 *
 * A tiny external store rather than context: the theme has exactly one writer
 * and every reader wants the same global value, so threading a provider through
 * the tree would be ceremony. useSyncExternalStore keeps the button in sync
 * with the attribute even if something else sets it.
 */
export type Theme = "light" | "dark";

const KEY = "dkip_theme";
const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode — the attribute still applies for this session */
  }
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(read() === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "dark", // server/prerender fallback; the client corrects on mount
  );
}
