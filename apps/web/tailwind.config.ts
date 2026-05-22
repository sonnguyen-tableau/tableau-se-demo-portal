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
          neutral: "var(--brand-neutral, #080707)",
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
            2: "#f3f3f3",
            3: "#e5e5e5",
            4: "#c9c9c9",
            6: "#939393",
            8: "#444444",
            9: "#2b2826",
            10: "#080707",
          },
        },
      },
      fontFamily: {
        sans: ['"Salesforce Sans"', "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        "sf-sm": "0 2px 4px 0 rgba(0,0,0,0.10)",
        "sf-md": "0 4px 12px 0 rgba(0,0,0,0.12)",
        "sf-lg": "0 8px 24px 0 rgba(0,0,0,0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
