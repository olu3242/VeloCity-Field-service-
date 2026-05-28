"use client";

import { Palette } from "lucide-react";
import { useVelocityTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const labels = {
  dark: "Dark",
  light: "Light",
  blue: "Blue",
  purple: "Purple",
  amber: "Amber",
};

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, themes, setTheme } = useVelocityTheme();

  return (
    <div
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-velocity-sm border border-velocity-border bg-velocity-carbon/80 p-1 text-velocity-muted",
        className
      )}
      aria-label="Theme switcher"
    >
      <Palette className="mx-2 h-4 w-4 text-velocity-volt" aria-hidden="true" />
      {themes.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setTheme(item)}
          className={cn(
            "min-h-9 rounded-[3px] px-3 font-mono text-[10px] uppercase tracking-[0.14em] transition",
            theme === item
              ? "bg-velocity-volt text-velocity-black shadow-velocity-glow"
              : "text-velocity-muted hover:bg-velocity-graphite hover:text-velocity-white"
          )}
          aria-pressed={theme === item}
        >
          {labels[item]}
        </button>
      ))}
    </div>
  );
}
