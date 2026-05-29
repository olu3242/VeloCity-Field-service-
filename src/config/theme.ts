export const THEME = {
  colors: {
    volt: "#CCFF00",
    black: "#0A0A0A",
    carbon: "#111827",
    white: "#F9FAFB",
    accent: "#6070F2",
  },
  volt: {
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
} as const;

export type Theme = typeof THEME;
