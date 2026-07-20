/** DKIP design tokens — defense command-console (dark tactical).
 *  One phosphor signal-teal accent; status trio reserved for meaning. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0E13",
        surface: { 1: "#0F151C", 2: "#151D26", 3: "#1C2733" },
        line: { DEFAULT: "#223040", strong: "#2E4256" },
        fg: { hi: "#E6EDF3", mid: "#9FB0C0", low: "#64788C" },
        signal: { DEFAULT: "#2CE0C4", dim: "#17A594", glow: "#5FF5E8" },
        ok: "#35C46B",
        caution: "#E3A72C",
        critical: "#E5484D",
        info: "#4C8DFF",
        band: { unclass: "#1C7A3F", restricted: "#8A6D1A", secret: "#9B2C2C" },
      },
      fontFamily: {
        display: ["Rajdhani", "system-ui", "sans-serif"],
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      letterSpacing: { widest2: "0.22em" },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 30px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(44,224,196,0.4), 0 0 22px -4px rgba(44,224,196,0.35)",
      },
      keyframes: {
        caret: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        sweep: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(220%)" } },
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        caret: "caret 1s steps(1) infinite",
        sweep: "sweep 1.6s ease-in-out infinite",
        rise: "rise .35s ease both",
      },
    },
  },
  plugins: [],
};
