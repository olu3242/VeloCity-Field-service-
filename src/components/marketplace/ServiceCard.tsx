import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MarketplaceIcon } from "@/components/marketplace/Icon";
import type { MarketplaceService } from "@/config/marketplace";
import { formatCents } from "@/lib/utils";

export function ServiceCard({ service }: { service: MarketplaceService }) {
  return (
    <Link
      href={`/services/${service.slug}`}
      className="group flex min-h-[220px] flex-col justify-between rounded-velocity-lg border border-velocity-border bg-velocity-carbon/80 p-5 shadow-velocity-panel transition duration-200 hover:-translate-y-1 hover:border-velocity-volt/70 hover:bg-velocity-graphite/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-velocity-volt"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-velocity-sm border border-velocity-border bg-velocity-black text-velocity-volt shadow-velocity-glow">
          <MarketplaceIcon name={service.icon} className="h-5 w-5" />
        </div>
        <ArrowUpRight className="h-5 w-5 text-velocity-muted transition group-hover:text-velocity-volt" aria-hidden="true" />
      </div>
      <div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="font-display text-3xl uppercase tracking-normal text-velocity-white">
            {service.label}
          </h2>
          {service.emergency ? (
            <span className="rounded-full border border-velocity-amber/50 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-velocity-amber">
              urgent
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-6 text-velocity-muted">{service.summary}</p>
        <div className="mt-5 flex items-center justify-between border-t border-velocity-border pt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-velocity-muted">
          <span>From {formatCents(service.startingAtCents)}</span>
          <span>{service.eta}</span>
        </div>
      </div>
    </Link>
  );
}
