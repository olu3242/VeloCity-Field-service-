"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultVelocityTheme,
  velocityThemeNames,
  velocityThemeStorageKey,
  type VelocityThemeName,
} from "@/config/theme";

type ThemeContextValue = {
  theme: VelocityThemeName;
  setTheme: (theme: VelocityThemeName) => void;
  themes: readonly VelocityThemeName[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: VelocityThemeName) {
  const root = document.documentElement;
  velocityThemeNames.forEach((name) => root.classList.remove(`theme-${name}`));
  root.classList.add(`theme-${theme}`);
  root.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<VelocityThemeName>(defaultVelocityTheme);

  useEffect(() => {
    const currentTheme = document.documentElement.dataset.theme as VelocityThemeName | undefined;
    if (currentTheme && velocityThemeNames.includes(currentTheme)) {
      setThemeState(currentTheme);
      return;
    }

    applyTheme(defaultVelocityTheme);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    themes: velocityThemeNames,
    setTheme(nextTheme) {
      setThemeState(nextTheme);
      applyTheme(nextTheme);
      window.localStorage.setItem(velocityThemeStorageKey, nextTheme);
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useVelocityTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useVelocityTheme must be used within ThemeProvider");
  }
  return value;
}
