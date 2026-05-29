"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  // On mount, read persisted theme from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("velocity-theme") as Theme | null;
      if (stored === "dark" || stored === "light") {
        setThemeState(stored);
      }
    } catch {
      // localStorage unavailable (SSR guard)
    }
  }, []);

  // Apply theme class to <html> and persist to localStorage whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    try {
      localStorage.setItem("velocity-theme", theme);
    } catch {
      // localStorage unavailable
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
