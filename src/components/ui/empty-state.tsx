import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  variant?: "light" | "dark";
  className?: string;
}

export function EmptyState({ icon, title, description, action, variant = "light", className }: EmptyStateProps) {
  const isDark = variant === "dark";

  return (
    <Card className={cn(isDark && "bg-gray-900 border-white/10", className)}>
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full text-2xl",
            isDark ? "bg-white/5 text-white/60" : "bg-gray-100 text-gray-400"
          )}
        >
          {icon}
        </div>
        <p className={cn("font-medium", isDark ? "text-white" : "text-gray-900")}>{title}</p>
        {description && (
          <p className={cn("text-sm max-w-sm", isDark ? "text-white/50" : "text-gray-500")}>
            {description}
          </p>
        )}
        {action && (
          <Button asChild className="mt-2">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
