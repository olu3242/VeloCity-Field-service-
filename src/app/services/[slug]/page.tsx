import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarClock, DollarSign, MapPin, ShieldCheck } from "lucide-react";
import { MarketplaceIcon, MarketplaceShell, ServiceCard } from "@/components/marketplace";
import { VelocityBadge, VelocityButton, VelocityPanel } from "@/components/branding";
import { getServiceBySlug, marketplaceServices } from "@/config/marketplace";
import { formatCents } from "@/lib/utils";

export function generateStaticParams() {
  return marketplaceServices.map((service) => ({ slug: service.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const service = getServiceBySlug(params.slug);
  return {
    title: service ? `${service.label} | VeloCity Field Service` : "Service | VeloCity",
    description: service?.summary,
  };
}

export default function ServiceDetailPage({ params }: { params: { slug: string } }) {
  const service = getServiceBySlug(params.slug);
  if (!service) notFound();

  const related = marketplaceServices
    .filter((candidate) => candidate.slug !== service.slug)
    .slice(0, 4);

  return (
    <MarketplaceShell>
      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div>
          <VelocityBadge>{service.emergency ? "Emergency dispatch ready" : "Scheduled and same-day ready"}</VelocityBadge>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-velocity-lg border border-velocity-border bg-velocity-carbon text-velocity-volt shadow-velocity-glow">
            <MarketplaceIcon name={service.icon} className="h-7 w-7" />
          </div>
          <h1 className="mt-6 font-display text-7xl uppercase tracking-normal text-velocity-white sm:text-8xl">
            {service.label}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-velocity-muted">{service.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <VelocityButton asChild>
              <Link href={`/book?category=${service.category}`}>
                Book {service.label} <ArrowRight className="h-4 w-4" />
              </Link>
            </VelocityButton>
            <VelocityButton asChild variant="outline">
              <Link href="/providers">View Provider Network</Link>
            </VelocityButton>
          </div>
        </div>

        <VelocityPanel className="h-fit">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: DollarSign, label: "Pricing Preview", value: `From ${formatCents(service.startingAtCents)}` },
              { icon: CalendarClock, label: "Typical ETA", value: service.eta },
              { icon: MapPin, label: "Coverage", value: "ZIP validated before booking" },
            ].map((item) => (
              <div key={item.label} className="rounded-velocity-sm border border-velocity-border bg-velocity-black/55 p-4">
                <item.icon className="h-5 w-5 text-velocity-volt" />
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-velocity-muted">{item.label}</p>
                <p className="mt-1 text-sm font-semibold text-velocity-white">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-velocity-sm border border-velocity-border bg-velocity-carbon/70 p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-velocity-volt">ALICE Intake Prompts</h2>
            <ul className="mt-4 space-y-3">
              {service.intakePrompts.map((prompt) => (
                <li key={prompt} className="flex gap-3 text-sm leading-6 text-velocity-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-velocity-volt" />
                  <span>{prompt}</span>
                </li>
              ))}
            </ul>
          </div>
        </VelocityPanel>
      </section>

      <section className="border-y border-velocity-border bg-velocity-carbon/35 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {service.trustSignals.map((signal) => (
            <div key={signal} className="rounded-velocity-lg border border-velocity-border bg-velocity-black/55 p-5">
              <ShieldCheck className="h-5 w-5 text-velocity-volt" />
              <p className="mt-4 text-sm font-semibold text-velocity-white">{signal}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-28 pt-14 sm:px-6 lg:px-8">
        <h2 className="font-display text-4xl uppercase tracking-normal text-velocity-white">Related services</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {related.map((item) => (
            <ServiceCard key={item.slug} service={item} />
          ))}
        </div>
      </section>
    </MarketplaceShell>
  );
}
