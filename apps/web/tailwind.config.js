/** DKIP design tokens — Binance-inspired professional trading / command platform.
 *  Deep near-black canvas, surface-card blocks, Binance Yellow CTAs, trading green/red semantics. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e11",
        surface: {
          0: "#0b0e11",
          1: "#15191f",
          2: "#1e2329",
          3: "#2b3139",
          4: "#3a424a",
        },
        line: {
          DEFAULT: "#2b3139",
          strong: "#3a424a",
          glow: "rgba(252, 213, 53, 0.35)",
        },
        fg: {
          hi: "#ffffff",
          mid: "#eaecef",
          low: "#707a8a",
          dim: "#5d6670",
        },
        accent: {
          DEFAULT: "#FCD535",
          dim: "#f0b90b",
          deep: "#c79c10",
          surface: "rgba(252, 213, 53, 0.12)",
        },
        ok: "#0ecb81",
        caution: "#F0B90B",
        critical: "#f6465d",
        info: "#3b82f6",
        band: { unclass: "#0ecb81", restricted: "#F0B90B", secret: "#f6465d" },
      },
      fontFamily: {
        display: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        panel: "none",
        card: "none",
        pop: "0 12px 40px rgba(0, 0, 0, 0.35)",
        glow: "0 0 20px rgba(252, 213, 53, 0.18), 0 0 40px rgba(252, 213, 53, 0.08)",
        "glow-sm": "0 0 10px rgba(252, 213, 53, 0.14)",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "200ms",
        slow: "300ms",
        slower: "400ms",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        caret: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        sweep: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(220%)" } },
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 12px rgba(252, 213, 53, 0.15)" },
          "50%": { boxShadow: "0 0 24px rgba(252, 213, 53, 0.35)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        caret: "caret 1s steps(1) infinite",
        sweep: "sweep 1.6s ease-in-out infinite",
        rise: "rise .35s cubic-bezier(0.4, 0, 0.2, 1) both",
        "pulse-glow": "pulseGlow 2.5s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
