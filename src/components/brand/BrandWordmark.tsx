"use client";
import { cn } from "@/lib/utils";

const textSizes = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

const fontWeights = {
  sm: "font-semibold",
  md: "font-bold",
  lg: "font-bold",
};

export function BrandWordmark({
  variant = "dark",
  size = "md",
  className,
}: {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const textColor = variant === "dark" ? "text-gray-950" : "text-white";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tracking-tight select-none",
        textSizes[size],
        fontWeights[size],
        textColor,
        className,
      )}
    >
      <span style={{ color: "#CCFF00" }}>⚡</span>
      <span>VeloCity</span>
    </span>
  );
}
