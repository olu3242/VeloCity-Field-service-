import { cn } from "@/lib/utils";
import { VelocityBadge } from "@/components/branding/VelocityBadge";

type VelocitySectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
};

export function VelocitySectionHeader({ eyebrow, title, description, className }: VelocitySectionHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <VelocityBadge>{eyebrow}</VelocityBadge>
      <h1 className="font-display text-4xl leading-none tracking-[0.06em] text-velocity-white md:text-5xl">
        {title}
      </h1>
      {description && <p className="max-w-2xl text-sm leading-6 text-velocity-muted">{description}</p>}
    </div>
  );
}
