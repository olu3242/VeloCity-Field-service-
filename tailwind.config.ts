import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        velocity: {
          50: "#f0f4ff",
          100: "#e0e9ff",
          200: "#c7d6fe",
          300: "#a5b8fc",
          400: "#8194f8",
          500: "#6070f2",
          600: "#4a4ee7",
          700: "#3c3dcc",
          800: "#3234a5",
          900: "#2e3182",
          950: "#1c1d4c",
        },
        "velocity-volt": {
          50: "#F5FFD6",
          100: "#EAFF99",
          200: "#D9FF4D",
          300: "#CCFF00",
          400: "#AACC00",
          500: "#88AA00",
          600: "#668800",
          700: "#4D6600",
          800: "#334400",
          900: "#1A2200",
          950: "#0D1100",
        },
        "velocity-black": "#0A0A0A",
        "velocity-carbon": "#111827",
        "velocity-white": "#F9FAFB",
      },
      fontFamily: {
        display: ["var(--font-display)", "Bebas Neue", "sans-serif"],
        body:    ["var(--font-body)",    "DM Sans",    "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)",    "Space Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(96, 112, 242, 0.7)" },
          "70%": { transform: "scale(1)", boxShadow: "0 0 0 10px rgba(96, 112, 242, 0)" },
          "100%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(96, 112, 242, 0)" },
        },
        "volt-pulse": {
          "0%, 100%": { opacity: "0.6", transform: "scale(0.98)" },
          "50%": { opacity: "1", transform: "scale(1.0)" },
        },
        "velocity-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-ring": "pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite",
        "volt-pulse": "volt-pulse 2s ease-in-out infinite",
        "velocity-spin": "velocity-spin 1s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
