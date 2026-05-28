import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/BrandLogo";

type VelocityLoaderProps = {
  label?: string;
  className?: string;
};

export function VelocityLoader({ label = "INITIALIZING VELOCITY OS", className }: VelocityLoaderProps) {
  return (
    <div className={cn("grid min-h-[50vh] place-items-center bg-velocity-black text-velocity-white", className)}>
      <div className="relative flex flex-col items-center gap-5">
        <div className="absolute size-32 rounded-full bg-velocity-volt/10 blur-3xl" />
        <BrandLogo showGlow markClassName="size-14 animate-[velocity-pulse_1.7s_ease-in-out_infinite]" />
        <div className="relative h-px w-44 overflow-hidden bg-velocity-border">
          <span className="absolute inset-y-0 left-0 w-20 bg-velocity-gradient-volt animate-[velocity-scan_1.4s_linear_infinite]" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-velocity-muted">{label}</p>
      </div>
    </div>
  );
}
