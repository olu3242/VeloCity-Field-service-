import { cn } from "@/lib/utils";

export function VelocityGlow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute rounded-full bg-velocity-volt/10 blur-3xl", className)}
    />
  );
}
