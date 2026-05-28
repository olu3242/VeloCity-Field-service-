import Link from "next/link";
import { ArrowRight, MapPin, Radar, ShieldCheck } from "lucide-react";
import { ServiceCard, MarketplaceShell } from "@/components/marketplace";
import { VelocityBadge, VelocityButton, VelocitySectionHeader } from "@/components/branding";
import { marketplaceServices } from "@/config/marketplace";

export default function ServicesPage() {
  return (
    <MarketplaceShell>
      <section className="mx-auto w-full max-w-7xl px-4 pb-24 pt-16 sm:px-6 lg:px-8 lg:pb-28">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <VelocityBadge>Local Service Marketplace</VelocityBadge>
            <h1 className="mt-5 font-display text-6xl uppercase tracking-normal text-velocity-white sm:text-8xl">
              Book local field service at operational velocity.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-velocity-muted">
              Pick a category, let ALICE structure the request, and route it into provider matching, pricing, scheduling, and live dispatch.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <VelocityButton asChild>
                <Link href="/book">Start Booking <ArrowRight className="h-4 w-4" /></Link>
              </VelocityButton>
              <VelocityButton asChild variant="outline">
                <Link href="/provider/apply">Become a Provider</Link>
              </VelocityButton>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: Radar, label: "AI Dispatch", body: "Provider matching uses category, proximity, urgency, trust, and availability." },
              { icon: MapPin, label: "Local Coverage", body: "Service areas and ZIP validation protect SLA quality before the job is created." },
              { icon: ShieldCheck, label: "Trust Layer", body: "Provider verification, ratings, payouts, and quality loops stay attached to runtime jobs." },
            ].map((item) => (
              <div key={item.label} className="rounded-velocity-lg border border-velocity-border bg-velocity-carbon/80 p-5">
                <item.icon className="h-5 w-5 text-velocity-volt" />
                <h2 className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-velocity-white">{item.label}</h2>
                <p className="mt-2 text-sm leading-6 text-velocity-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-velocity-border bg-velocity-carbon/35 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <VelocitySectionHeader
            eyebrow="// SERVICE GRID"
            title="Choose a service"
            description="Every service card is route-connected and starts the same runtime booking flow."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {marketplaceServices.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </div>
      </section>
    </MarketplaceShell>
  );
}
