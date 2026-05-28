import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";
import { VelocityBadge, VelocityButton, VelocityPanel } from "@/components/branding";

type InfoPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  cta?: {
    label: string;
    href: string;
  };
};

export function InfoPage({ eyebrow, title, description, bullets, cta }: InfoPageProps) {
  return (
    <MarketplaceShell>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-28 pt-16 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:px-8">
        <div>
          <VelocityBadge>{eyebrow}</VelocityBadge>
          <h1 className="mt-5 font-display text-6xl uppercase tracking-normal text-velocity-white sm:text-8xl">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-velocity-muted">{description}</p>
          {cta ? (
            <VelocityButton asChild className="mt-8">
              <Link href={cta.href}>
                {cta.label} <ArrowRight className="h-4 w-4" />
              </Link>
            </VelocityButton>
          ) : null}
        </div>
        <VelocityPanel>
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-velocity-volt">Runtime Coverage</h2>
          <ul className="mt-5 space-y-4">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 text-sm leading-6 text-velocity-muted">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-velocity-volt" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </VelocityPanel>
      </section>
    </MarketplaceShell>
  );
}
