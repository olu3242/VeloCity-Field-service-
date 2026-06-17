import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  /** Use on dark portal pages (provider, admin, dispatch, franchise) to match the page background. */
  variant?: "light" | "dark";
  valueClassName?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  variant = "light",
  valueClassName,
  className,
}: StatCardProps) {
  const isDark = variant === "dark";

  return (
    <Card className={cn(isDark && "bg-gray-900 border-white/10", className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "text-3xl font-bold",
              isDark ? "text-white" : "text-gray-900",
              valueClassName
            )}
          >
            {value}
          </div>
          {icon && (
            <span className={cn("text-xl", isDark ? "text-white/40" : "text-gray-400")}>
              {icon}
            </span>
          )}
        </div>
        <div className={cn("text-sm mt-1", isDark ? "text-white/50" : "text-gray-500")}>
          {label}
        </div>
        {hint && (
          <div className={cn("mt-2 text-xs", isDark ? "text-white/40" : "text-gray-400")}>
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
