import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe2, Landmark, Network, RadioTower, Route, ShieldCheck } from "lucide-react";
import { VelocityBadge, VelocityButton, VelocityPanel } from "@/components/branding";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getGlobalInfrastructureOsSummary } from "@/runtime/infrastructure/global-os";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-velocity-muted">{label}</div>
      <div className="mt-2 font-mono text-2xl text-velocity-white">{value}</div>
    </div>
  );
}

function CountPanel({ title, icon: Icon, count }: { title: string; icon: typeof Globe2; count: number }) {
  return (
    <VelocityPanel>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-velocity-muted">{title}</div>
          <div className="mt-3 font-mono text-3xl text-velocity-white">{count}</div>
        </div>
        <Icon className="h-5 w-5 text-velocity-volt" aria-hidden="true" />
      </div>
    </VelocityPanel>
  );
}

export default async function InfrastructureOsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const data = await getGlobalInfrastructureOsSummary(getTenantId(profile));
  const snapshot = data.cloud.snapshots[0] as
    | {
        infrastructure_score?: number;
        service_grid_score?: number;
        liquidity_score?: number;
        governance_score?: number;
        systemic_risk_score?: number;
      }
    | undefined;

  return (
    <main className="min-h-screen bg-velocity-black px-4 py-8 text-velocity-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <VelocityBadge>{"// INFRASTRUCTURE OS"}</VelocityBadge>
            <h1 className="mt-4 font-display text-6xl uppercase tracking-normal">Global Operations Fabric</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-velocity-muted">
              Supervised infrastructure cloud, national service grid, AI operations exchange, global governance, and compliance intelligence.
            </p>
          </div>
          <div className="flex gap-3">
            <VelocityButton asChild variant="outline">
              <Link href="/dashboard/system/national">National Ops</Link>
            </VelocityButton>
            <VelocityButton asChild>
              <Link href="/api/admin/infrastructure/global">Global JSON</Link>
            </VelocityButton>
          </div>
        </div>

        <VelocityPanel>
          <div className="grid gap-4 md:grid-cols-5">
            <Metric label="Infrastructure" value={snapshot?.infrastructure_score ?? "pending"} />
            <Metric label="Service Grid" value={snapshot?.service_grid_score ?? "pending"} />
            <Metric label="Liquidity" value={snapshot?.liquidity_score ?? "pending"} />
            <Metric label="Governance" value={snapshot?.governance_score ?? "pending"} />
            <Metric label="Systemic Risk" value={snapshot?.systemic_risk_score ?? "pending"} />
          </div>
        </VelocityPanel>

        <div className="grid gap-4 md:grid-cols-3">
          <CountPanel title="Runtime Clusters" icon={RadioTower} count={data.cloud.runtimeClusters.length} />
          <CountPanel title="Service Grid" icon={Network} count={data.cloud.serviceGrid.length} />
          <CountPanel title="AI Exchange" icon={Route} count={data.cloud.operationsExchange.length} />
          <CountPanel title="Global Federation" icon={Globe2} count={data.territoryFederations.length} />
          <CountPanel title="Governance AI" icon={ShieldCheck} count={data.governanceAi.length + data.governanceFabric.length} />
          <CountPanel title="Global Economy" icon={Landmark} count={data.serviceEconomy.length + data.liquidity.length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <VelocityPanel>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Operations Fabric</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Fabric Links" value={data.cloud.operationsFabric.length} />
              <Metric label="Fabric Health" value={data.cloud.fabricHealth.length} />
              <Metric label="Resource Allocation" value={data.cloud.resourceAllocation.length} />
              <Metric label="Workforce Liquidity" value={data.cloud.workforceLiquidity.length} />
            </div>
          </VelocityPanel>

          <VelocityPanel>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Governance Intelligence</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Compliance Models" value={data.compliance.length} />
              <Metric label="Diplomacy Signals" value={data.diplomacy.length} />
              <Metric label="International Regions" value={data.internationalTerritories.length} />
              <Metric label="Intelligence Core" value={data.intelligenceCore.length} />
            </div>
          </VelocityPanel>
        </div>
      </div>
    </main>
  );
}
