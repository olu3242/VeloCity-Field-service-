import * as React from "react";
import { cn } from "@/lib/utils";

export function VelocityBadge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-velocity-sm border border-velocity-volt/30 bg-velocity-volt/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-velocity-volt",
        className
      )}
      {...props}
    />
  );
}
