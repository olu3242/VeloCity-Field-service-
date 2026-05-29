import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, BrainCircuit, Landmark, Network, ShieldAlert, UsersRound } from "lucide-react";
import { VelocityBadge, VelocityButton, VelocityPanel } from "@/components/branding";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getEcosystemEconomySummary } from "@/runtime/ecosystem/economy";
import { getNationalOperationsSummary } from "@/runtime/intelligence/national-operations";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-velocity-muted">{label}</div>
      <div className="mt-2 font-mono text-2xl text-velocity-white">{value}</div>
    </div>
  );
}

function CountPanel({ title, icon: Icon, count }: { title: string; icon: typeof BarChart3; count: number }) {
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

export default async function NationalOperationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const tenantId = getTenantId(profile);
  const [national, ecosystem] = await Promise.all([
    getNationalOperationsSummary(tenantId),
    getEcosystemEconomySummary(tenantId),
  ]);

  const latestSnapshot = national.snapshots[0] as
    | { health_score?: number; risk_score?: number; workforce_score?: number; profitability_score?: number }
    | undefined;

  return (
    <main className="min-h-screen bg-velocity-black px-4 py-8 text-velocity-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <VelocityBadge>{"// NATIONAL AI OPS"}</VelocityBadge>
            <h1 className="mt-4 font-display text-6xl uppercase tracking-normal">Predictive Operations</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-velocity-muted">
              Supervised forecasting, territory optimization, workforce liquidity, financial risk, and ecosystem exchange telemetry.
            </p>
          </div>
          <div className="flex gap-3">
            <VelocityButton asChild variant="outline">
              <Link href="/api/admin/ecosystem/economy">Ecosystem JSON</Link>
            </VelocityButton>
            <VelocityButton asChild>
              <Link href="/api/admin/intelligence/national">National JSON</Link>
            </VelocityButton>
          </div>
        </div>

        <VelocityPanel>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Health Score" value={latestSnapshot?.health_score ?? "pending"} />
            <Metric label="Risk Score" value={latestSnapshot?.risk_score ?? "pending"} />
            <Metric label="Workforce Score" value={latestSnapshot?.workforce_score ?? "pending"} />
            <Metric label="Profitability" value={latestSnapshot?.profitability_score ?? "pending"} />
          </div>
        </VelocityPanel>

        <div className="grid gap-4 md:grid-cols-3">
          <CountPanel title="Predictive Insights" icon={BrainCircuit} count={national.predictiveInsights.length} />
          <CountPanel title="Recommendations" icon={BarChart3} count={national.recommendations.length} />
          <CountPanel title="National Risk Models" icon={ShieldAlert} count={national.nationalRisk.length} />
          <CountPanel title="Workforce Signals" icon={UsersRound} count={national.workforce.length} />
          <CountPanel title="Partner Signals" icon={Network} count={ecosystem.partners.length + ecosystem.partnerProfiles.length} />
          <CountPanel title="Infrastructure Economy" icon={Landmark} count={ecosystem.infrastructureProducts.length + ecosystem.exchange.length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <VelocityPanel>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Operational Recommendations</h2>
            <div className="mt-4 space-y-3">
              {national.recommendations.slice(0, 5).map((item: { id: string; recommendation?: string; severity?: string }) => (
                <div key={item.id} className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-velocity-volt">{item.severity ?? "info"}</div>
                  <p className="mt-2 text-sm text-velocity-muted">{item.recommendation ?? "No recommendation text recorded."}</p>
                </div>
              ))}
              {!national.recommendations.length ? (
                <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4 text-sm text-velocity-muted">
                  No supervised recommendation cycles have been generated yet.
                </div>
              ) : null}
            </div>
          </VelocityPanel>

          <VelocityPanel>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Ecosystem Economy</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Workforce Liquidity" value={ecosystem.workforceLiquidity.length} />
              <Metric label="Provider Finance" value={ecosystem.providerFinance.length} />
              <Metric label="Territory Economics" value={ecosystem.territoryEconomics.length} />
              <Metric label="Usage Billing" value={ecosystem.usageBilling.length} />
            </div>
          </VelocityPanel>
        </div>
      </div>
    </main>
  );
}
