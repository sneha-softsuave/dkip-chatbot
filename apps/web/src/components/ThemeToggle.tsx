import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

import { toggleTheme, useTheme } from "../lib/theme";
import { cx } from "./ui";

/**
 * Light/dark switch. The icon is what changes, so it is the icon that animates —
 * the outgoing glyph rotates and fades out as the incoming one arrives, a small
 * confirmation that the click landed. The label always names what a press will
 * do next, not the state it is in.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const still = useReducedMotion();
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className={cx(
        "relative grid h-9 w-9 place-items-center overflow-hidden rounded-md text-fg-dim",
        "transition-colors duration-fast hover:bg-surface-2 hover:text-fg-hi",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          initial={still ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={still ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 grid place-items-center"
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
