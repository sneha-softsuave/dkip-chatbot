/** DKIP design tokens.
 *
 *  Near-monochrome dark canvas. The grey ramp carries all structure; the accent
 *  means "this is interactive" and nothing else. Status lives in ok/caution/
 *  critical, which are also the four provenance-gutter colours — in a ~95%
 *  greyscale interface those marks are close to the only colour on screen,
 *  which is what makes them read as meaning rather than decoration.
 *
 *  Accent rules (enforced by review, see docs — plan §"Tokens"):
 *    1. one accent-filled primary CTA per screen
 *    2. accent never carries status
 *    3. focus rings use accent + outline-offset, so no second focus token
 *
 *  No colour is spelled out here. Each token points at a --c-* custom property
 *  declared in src/index.css, and MUST keep the `rgb(var(--x) / <alpha-value>)`
 *  form: the properties hold bare channel triples precisely so that placeholder
 *  can survive. Writing a hex or dropping <alpha-value> builds clean and
 *  silently flattens every opacity variant in the app to full opacity.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: {
          1: "rgb(var(--c-surface-1) / <alpha-value>)",
          2: "rgb(var(--c-surface-2) / <alpha-value>)",
          3: "rgb(var(--c-surface-3) / <alpha-value>)",
          4: "rgb(var(--c-surface-4) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--c-line) / <alpha-value>)",
          strong: "rgb(var(--c-line-strong) / <alpha-value>)",
        },
        fg: {
          hi: "rgb(var(--c-fg-hi) / <alpha-value>)",
          mid: "rgb(var(--c-fg-mid) / <alpha-value>)",
          low: "rgb(var(--c-fg-low) / <alpha-value>)",
          dim: "rgb(var(--c-fg-dim) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          dim: "rgb(var(--c-accent-dim) / <alpha-value>)",
          /* The one token with a baked alpha and no <alpha-value>: it is a
             fixed 12% wash of the accent, and no site uses bg-accent-surface
             with an opacity suffix. So it derives from --c-accent rather than
             owning a channel triple of its own — one less thing to restate. */
          surface: "rgb(var(--c-accent) / 0.12)",
          /* Identity tints, NOT semantic. Used only to tell the three demo
             roles apart on the login screen. Three weights of one family
             instead of three unrelated hues, so `ok` green keeps meaning
             "cited and current" and nothing else. */
          soft: "rgb(var(--c-accent-soft) / <alpha-value>)",
          pale: "rgb(var(--c-accent-pale) / <alpha-value>)",
        },
        ok: "rgb(var(--c-ok) / <alpha-value>)",
        caution: "rgb(var(--c-caution) / <alpha-value>)",
        critical: "rgb(var(--c-critical) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      /* Named tiers, so screens pick a role rather than a pixel size. */
      fontSize: {
        /* Unauthenticated hero only. In-app page titles stay on h1/display —
           nothing inside the product needs 56px type. */
        hero: ["3rem", { lineHeight: "1.08", letterSpacing: "-0.03em", fontWeight: "700" }],
        display: ["2rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em", fontWeight: "600" }],
        /* In-app page titles. Dense enterprise apps keep the title close to the
           body; 20px + weight/colour carries the hierarchy, not 32px. */
        title: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em", fontWeight: "600" }],
        h1: ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em", fontWeight: "600" }],
        h2: ["1rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        prose: ["0.9375rem", { lineHeight: "1.625rem" }],
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        label: ["0.75rem", { lineHeight: "1rem", fontWeight: "500" }],
        micro: ["0.6875rem", { lineHeight: "0.875rem", letterSpacing: "0.08em", fontWeight: "500" }],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
      },
      /* Elevation. Each step pairs a cast shadow with a top inner hairline so
         surfaces read as lit from above rather than as outlined rectangles.
         The strings live in :root (index.css) because that hairline is a
         dark-canvas device and a theme has to be able to restate the whole
         recipe, not just recolour it. `glow` is not part of the scale — it is
         accent-only, so it tracks --c-accent and needs no property. */
      boxShadow: {
        e1: "var(--e1)",
        e2: "var(--e2)",
        e3: "var(--e3)",
        glow: "0 0 32px -8px rgb(var(--c-accent) / 0.45)",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "200ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        caret: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        sweep: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(220%)" } },
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        caret: "caret 1s steps(1) infinite",
        sweep: "sweep 1.6s ease-in-out infinite",
        rise: "rise .2s cubic-bezier(0.16, 1, 0.3, 1) both",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
