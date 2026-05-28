import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AiFlowPanel, MarketplaceShell } from "@/components/marketplace";
import { VelocityButton } from "@/components/branding";
import { aiAgentPages, getAgentBySlug } from "@/config/marketplace";

export function generateStaticParams() {
  return aiAgentPages.map((agent) => ({ agent: agent.slug }));
}

export function generateMetadata({ params }: { params: { agent: string } }) {
  const agent = getAgentBySlug(params.agent);
  return {
    title: agent ? `${agent.name} ${agent.role} | VeloCity AI System` : "AI System | VeloCity",
    description: agent?.summary,
  };
}

export default function AgentPage({ params }: { params: { agent: string } }) {
  const agent = getAgentBySlug(params.agent);
  if (!agent) notFound();

  return (
    <MarketplaceShell>
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
        <AiFlowPanel agent={agent} />
      </section>

      <section className="border-y border-velocity-border bg-velocity-carbon/35 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-4">
          {aiAgentPages.map((item) => (
            <Link
              key={item.slug}
              href={item.route}
              className="rounded-velocity-lg border border-velocity-border bg-velocity-black/55 p-5 transition hover:border-velocity-volt hover:bg-velocity-graphite"
            >
              <div className="font-display text-4xl uppercase tracking-normal text-velocity-white">{item.name}</div>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-velocity-muted">{item.role}</p>
              <p className="mt-4 text-sm leading-6 text-velocity-muted">{item.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-5 px-4 pb-28 pt-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <h2 className="font-display text-4xl uppercase tracking-normal text-velocity-white">Run the workflow against a real request.</h2>
          <p className="mt-3 text-velocity-muted">Booking creation persists through Supabase, emits automation events, and starts AI dispatch orchestration.</p>
        </div>
        <VelocityButton asChild>
          <Link href="/book">Create Service Request <ArrowRight className="h-4 w-4" /></Link>
        </VelocityButton>
      </section>
    </MarketplaceShell>
  );
}
