import Link from "next/link";
import { Activity, ArrowRight, Route, ShieldCheck } from "lucide-react";
import { VelocityButton, VelocityPanel } from "@/components/branding";
import type { AgentPage } from "@/config/marketplace";

export function AiFlowPanel({ agent }: { agent: AgentPage }) {
  return (
    <VelocityPanel className="relative overflow-hidden">
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-velocity-volt to-transparent" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-velocity-volt">
            V.OS Agent Node
          </p>
          <h1 className="mt-3 font-display text-6xl uppercase tracking-normal text-velocity-white sm:text-7xl">
            {agent.name}
          </h1>
          <p className="mt-2 font-mono text-sm uppercase tracking-[0.16em] text-velocity-muted">
            {agent.role}
          </p>
          <p className="mt-6 text-lg leading-8 text-velocity-muted">{agent.summary}</p>
        </div>
        <VelocityButton asChild>
          <Link href="/book">Run Intake</Link>
        </VelocityButton>
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {agent.metrics.map((metric) => (
          <div key={metric.label} className="rounded-velocity-sm border border-velocity-border bg-velocity-black/60 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-velocity-muted">{metric.label}</div>
            <div className="mt-2 font-mono text-lg text-velocity-volt">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-4">
        {agent.flow.map((step, index) => (
          <div key={step} className="rounded-velocity-sm border border-velocity-border bg-velocity-carbon/70 p-4">
            <div className="mb-4 flex items-center justify-between text-velocity-volt">
              {index === 0 ? <Activity className="h-5 w-5" /> : index === 1 ? <Route className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              {index < agent.flow.length - 1 ? <ArrowRight className="h-4 w-4 text-velocity-muted" /> : null}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-velocity-muted">Step {index + 1}</div>
            <p className="mt-2 text-sm leading-6 text-velocity-white">{step}</p>
          </div>
        ))}
      </div>
    </VelocityPanel>
  );
}
