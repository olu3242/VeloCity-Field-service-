import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, Globe2, Network, ShieldAlert, Workflow } from "lucide-react";
import { VelocityBadge, VelocityButton, VelocityPanel } from "@/components/branding";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getPlanetaryOperationsSummary } from "@/runtime/infrastructure/planetary-operations";

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

export default async function PlanetaryOperationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const data = await getPlanetaryOperationsSummary(getTenantId(profile));
  const snapshot = data.snapshots[0] as
    | {
        operations_grid_score?: number;
        workforce_score?: number;
        continuity_score?: number;
        resilience_score?: number;
        emergency_readiness_score?: number;
        systemic_risk_score?: number;
      }
    | undefined;

  return (
    <main className="min-h-screen bg-velocity-black px-4 py-8 text-velocity-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <VelocityBadge>{"// PLANETARY OPS"}</VelocityBadge>
            <h1 className="mt-4 font-display text-6xl uppercase tracking-normal">Continuity Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-velocity-muted">
              Governed planetary coordination for continuity, resilience, emergency routing, infrastructure health, and systemic risk.
            </p>
          </div>
          <div className="flex gap-3">
            <VelocityButton asChild variant="outline">
              <Link href="/dashboard/system/infrastructure">Infrastructure OS</Link>
            </VelocityButton>
            <VelocityButton asChild>
              <Link href="/api/admin/infrastructure/planetary">Planetary JSON</Link>
            </VelocityButton>
          </div>
        </div>

        <VelocityPanel>
          <div className="grid gap-4 md:grid-cols-6">
            <Metric label="Ops Grid" value={snapshot?.operations_grid_score ?? "pending"} />
            <Metric label="Workforce" value={snapshot?.workforce_score ?? "pending"} />
            <Metric label="Continuity" value={snapshot?.continuity_score ?? "pending"} />
            <Metric label="Resilience" value={snapshot?.resilience_score ?? "pending"} />
            <Metric label="Emergency" value={snapshot?.emergency_readiness_score ?? "pending"} />
            <Metric label="Systemic Risk" value={snapshot?.systemic_risk_score ?? "pending"} />
          </div>
        </VelocityPanel>

        <div className="grid gap-4 md:grid-cols-3">
          <CountPanel title="Operations Grid" icon={Globe2} count={data.operationsGrid.length} />
          <CountPanel title="Workforce Network" icon={Network} count={data.workforceNetwork.length} />
          <CountPanel title="Continuity Ops" icon={Workflow} count={data.continuity.length} />
          <CountPanel title="Resilience" icon={Activity} count={data.resilience.length} />
          <CountPanel title="Emergency Network" icon={ShieldAlert} count={data.emergencyNetwork.length} />
          <CountPanel title="Stabilization" icon={AlertTriangle} count={data.stabilization.length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <VelocityPanel>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Civilization Fabric</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Service Networks" value={data.serviceNetworks.length} />
              <Metric label="Operations Fabric" value={data.operationsFabric.length} />
              <Metric label="Infrastructure Models" value={data.infrastructureModels.length} />
              <Metric label="Economic Models" value={data.economicModels.length} />
            </div>
          </VelocityPanel>

          <VelocityPanel>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Escalation Controls</h2>
            <div className="mt-4 space-y-3 text-sm text-velocity-muted">
              <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
                Central escalation authority remains required for emergency deployment and infrastructure intervention.
              </div>
              <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
                AI outputs are stored as explainable recommendations and risk signals, not autonomous policy changes.
              </div>
            </div>
          </VelocityPanel>
        </div>
      </div>
    </main>
  );
}
