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
        "velocity-black": "var(--black)",
        "velocity-carbon": "var(--carbon)",
        "velocity-graphite": "var(--graphite)",
        "velocity-slate": "var(--slate)",
        "velocity-border": "var(--velocity-border)",
        "velocity-volt": "var(--volt)",
        "velocity-amber": "var(--amber)",
        "velocity-ice": "var(--ice)",
        "velocity-white": "var(--white)",
        "velocity-muted": "var(--muted)",
        velocity: {
          black: "var(--black)",
          carbon: "var(--carbon)",
          graphite: "var(--graphite)",
          slate: "var(--slate)",
          border: "var(--velocity-border)",
          volt: "var(--volt)",
          amber: "var(--amber)",
          ice: "var(--ice)",
          white: "var(--white)",
          muted: "var(--muted)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "velocity-sm": "var(--velocity-radius-sm)",
        "velocity-md": "var(--velocity-radius-md)",
        "velocity-lg": "var(--velocity-radius-lg)",
        "velocity-xl": "var(--velocity-radius-xl)",
      },
      boxShadow: {
        "velocity-panel": "var(--velocity-shadow-panel)",
        "velocity-glow": "var(--velocity-shadow-glow)",
      },
      backgroundImage: {
        "velocity-panel": "var(--velocity-gradient-panel)",
        "velocity-volt": "var(--velocity-gradient-volt)",
        "velocity-command": "var(--velocity-gradient-command)",
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
          "0%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(200, 241, 53, 0.7)" },
          "70%": { transform: "scale(1)", boxShadow: "0 0 0 10px rgba(200, 241, 53, 0)" },
          "100%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(200, 241, 53, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-ring": "pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
