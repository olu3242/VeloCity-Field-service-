import { BrandLogo } from "@/components/branding/BrandLogo";

type BrandWordmarkProps = {
  className?: string;
  compact?: boolean;
};

export function BrandWordmark({
  className,
  compact = false,
}: BrandWordmarkProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <BrandLogo showGlow />
      {!compact && (
        <span className="font-display text-xl tracking-[0.12em] text-velocity-white">
          VELO<span className="text-velocity-volt">CITY</span>
        </span>
      )}
    </div>
  );
}