import * as React from "react";
import { cn } from "@/lib/utils";

export function VelocityPanel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("velocity-glass rounded-velocity-lg p-6 shadow-velocity-panel", className)}
      {...props}
    />
  );
}
