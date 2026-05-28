import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  showGlow?: boolean;
};

export function BrandLogo({ className, markClassName, showGlow = false }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center justify-center", className)} aria-hidden="true">
      <span
        className={cn(
          "relative grid size-9 place-items-center bg-velocity-volt text-velocity-black",
          showGlow && "shadow-[0_0_32px_rgba(200,241,53,0.35)]",
          markClassName
        )}
        style={{ clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)" }}
      >
        <span className="font-display text-base leading-none tracking-[0.08em]">V</span>
      </span>
    </span>
  );
}
