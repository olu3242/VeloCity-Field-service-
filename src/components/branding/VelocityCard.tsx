import * as React from "react";
import { cn } from "@/lib/utils";

export function VelocityCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("velocity-panel rounded-velocity-lg p-6 text-velocity-white", className)}
      {...props}
    />
  );
}
