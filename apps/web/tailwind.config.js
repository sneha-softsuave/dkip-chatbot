/** DKIP design tokens — enterprise defense console. Charcoal surfaces, a
 *  single steel-blue interactive accent, muted military-green reserved for
 *  verified/serviceable status. Flat, disciplined, no decorative chrome. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#021641",
        surface: { 1: "#071D4E", 2: "#0D275C", 3: "#14316B" },
        line: { DEFAULT: "#1F3A66", strong: "#2E4F85" },
        fg: { hi: "#F7FEFF", mid: "#CDDBE8", low: "#7C93AF" },
        accent: { DEFAULT: "#4A7FB5", dim: "#3A6690", deep: "#1D2C38" },
        ok: "#5E9468",
        caution: "#B08A45",
        critical: "#B4453D",
        info: "#4A7FB5",
        band: { unclass: "#4C7A52", restricted: "#A67C3D", secret: "#8A3830" },
      },
      fontFamily: {
        display: ["Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        panel: "0 1px 2px 0 rgba(0,0,0,0.3)",
        card: "0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.3)",
        pop: "0 8px 24px -8px rgba(0,0,0,0.5)",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "200ms",
        slow: "300ms",
      },
      keyframes: {
        caret: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        sweep: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(220%)" } },
        rise: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        caret: "caret 1s steps(1) infinite",
        sweep: "sweep 1.6s ease-in-out infinite",
        rise: "rise .25s ease both",
      },
    },
  },
  plugins: [],
};
