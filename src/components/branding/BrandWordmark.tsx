import Link from "next/link";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/BrandLogo";

type BrandWordmarkProps = {
  href?: string;
  className?: string;
  compact?: boolean;
};

export function BrandWordmark({ href = "/", className, compact = false }: BrandWordmarkProps) {
  const content = (
    <>
      <BrandLogo showGlow />
      {!compact && (
        <span className="font-display text-xl tracking-[0.12em] text-velocity-white">
          VELO<span className="text-velocity-volt">CITY</span>
        </span>
      )}
    </>
  );

  return (
    <Link href={href} className={cn("inline-flex items-center gap-3", className)}>
      {content}
    </Link>
  );
}
