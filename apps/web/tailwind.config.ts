import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand-primary, #0176d3)",
          hover: "#0b5cab",
          dark: "#032d60",
          light: "#eef4ff",
          secondary: "var(--brand-secondary, #032d60)",
          neutral: "var(--brand-neutral, #032d60)",
        },
        sf: {
          blue: {
            10: "#eef4ff",
            20: "#cfe4fe",
            40: "#78b0fd",
            60: "#1b96ff",
            70: "#0176d3",
            80: "#0b5cab",
            90: "#032d60",
          },
          neutral: {
            1: "#ffffff",
            2: "#f8f9fb",
            3: "#e8eaee",
            4: "#c9cdd4",
            5: "#9aa0ab",
            6: "#6b7280",
            7: "#4b5563",
            8: "#374151",
            9: "#1f2937",
            10: "#0b1220",
          },
        },
        surface: {
          base: "var(--surface-base, #ffffff)",
          subtle: "var(--surface-subtle, #f8f9fb)",
          muted: "var(--surface-muted, #f1f3f7)",
          inverted: "var(--surface-inverted, #0b1220)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          '"Inter"',
          '"Salesforce Sans"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: [
          "var(--font-display, var(--font-sans))",
          '"Inter"',
          '"Salesforce Sans"',
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        meta:    ["11px", { lineHeight: "14px", letterSpacing: "0.02em" }],
        caption: ["12px", { lineHeight: "16px", letterSpacing: "0.01em" }],
        "body-sm": ["13px", { lineHeight: "18px" }],
        body:    ["14px", { lineHeight: "22px" }],
        "body-lg": ["16px", { lineHeight: "24px" }],
        h3:      ["18px", { lineHeight: "26px", letterSpacing: "-0.005em", fontWeight: "600" }],
        h2:      ["22px", { lineHeight: "30px", letterSpacing: "-0.01em", fontWeight: "700" }],
        h1:      ["28px", { lineHeight: "36px", letterSpacing: "-0.015em", fontWeight: "700" }],
        display: ["40px", { lineHeight: "48px", letterSpacing: "-0.02em", fontWeight: "800" }],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        // Legacy SLDS shadows — kept for back-compat during the design refresh
        "sf-sm": "0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)",
        "sf-md": "0 4px 12px 0 rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.04)",
        "sf-lg": "0 12px 32px 0 rgba(15, 23, 42, 0.12), 0 4px 8px 0 rgba(15, 23, 42, 0.06)",
        // Modern elevation tokens — use these for new work
        "elev-0": "0 0 0 1px rgba(15, 23, 42, 0.06)",
        "elev-1": "0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.05)",
        "elev-2": "0 4px 12px 0 rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.04)",
        "elev-3": "0 12px 32px 0 rgba(15, 23, 42, 0.12), 0 4px 8px 0 rgba(15, 23, 42, 0.06)",
        "elev-4": "0 24px 56px 0 rgba(15, 23, 42, 0.18), 0 8px 16px 0 rgba(15, 23, 42, 0.08)",
        "glow-brand": "0 0 0 1px var(--brand-primary, #0176d3), 0 10px 28px -8px rgba(1, 118, 211, 0.45)",
        "ring-focus": "0 0 0 2px #ffffff, 0 0 0 4px var(--brand-primary, #0176d3)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        "fade-in":      { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up":     { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "shimmer":      { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "pulse-ring":   { "0%": { boxShadow: "0 0 0 0 rgba(1, 118, 211, 0.45)" }, "100%": { boxShadow: "0 0 0 14px rgba(1, 118, 211, 0)" } },
      },
      animation: {
        "fade-in":    "fade-in 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-up":   "slide-up 240ms cubic-bezier(0.4, 0, 0.2, 1)",
        "shimmer":    "shimmer 1.6s linear infinite",
        "pulse-ring": "pulse-ring 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
      },
      backgroundImage: {
        "mesh-brand":
          "radial-gradient(at 12% 20%, rgba(1, 118, 211, 0.35) 0px, transparent 45%), radial-gradient(at 80% 0%, rgba(27, 150, 255, 0.25) 0px, transparent 50%), radial-gradient(at 90% 80%, rgba(120, 176, 253, 0.18) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(3, 45, 96, 0.6) 0px, transparent 60%)",
        "mesh-soft":
          "radial-gradient(at 0% 0%, rgba(238, 244, 255, 0.9) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(207, 228, 254, 0.6) 0px, transparent 45%)",
      },
    },
  },
  plugins: [],
};

export default config;
