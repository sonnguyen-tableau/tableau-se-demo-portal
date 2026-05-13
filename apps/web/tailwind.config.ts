import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand-primary, #1A56DB)",
          secondary: "var(--brand-secondary, #F59E0B)",
          neutral: "var(--brand-neutral, #0F172A)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans, Inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
