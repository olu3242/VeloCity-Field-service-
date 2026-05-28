import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, Clock, Radio, Server, WalletCards, XCircle } from "lucide-react";
import { VelocityBadge, VelocityButton, VelocityPanel } from "@/components/branding";
import { createClient } from "@/lib/supabase/server";
import { getSystemHealth, type ServiceStatus } from "@/runtime/health/system-health";

function StatusDot({ status }: { status: ServiceStatus }) {
  const color = status === "healthy" ? "text-velocity-volt" : status === "degraded" ? "text-velocity-amber" : "text-red-400";
  const Icon = status === "healthy" ? CheckCircle2 : status === "degraded" ? AlertTriangle : XCircle;
  return <Icon className={`h-5 w-5 ${color}`} aria-hidden="true" />;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-velocity-muted">{label}</div>
      <div className="mt-2 font-mono text-2xl text-velocity-white">{value}</div>
    </div>
  );
}

function formatAge(iso: string | null) {
  if (!iso) return "never";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default async function RuntimeDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const health = await getSystemHealth();

  return (
    <main className="min-h-screen bg-velocity-black px-4 py-8 text-velocity-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <VelocityBadge>{"// SYSTEM RUNTIME"}</VelocityBadge>
            <h1 className="mt-4 font-display text-6xl uppercase tracking-normal">Operational Health</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-velocity-muted">
              Live service connectivity, queue depth, worker heartbeat, payout health, and degraded-mode warnings.
            </p>
          </div>
          <div className="flex gap-3">
            <VelocityButton asChild variant="outline">
              <Link href="/admin/automation">Automation Center</Link>
            </VelocityButton>
            <VelocityButton asChild>
              <Link href="/api/system/health">Health JSON</Link>
            </VelocityButton>
          </div>
        </div>

        <VelocityPanel>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Runtime Status" value={health.status.toUpperCase()} />
            <Metric label="Environment" value={health.environment} />
            <Metric label="Workers Online" value={health.workers.online} />
            <Metric label="Last Worker Seen" value={formatAge(health.workers.lastSeenAt)} />
          </div>
        </VelocityPanel>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <VelocityPanel>
            <div className="mb-5 flex items-center gap-2">
              <Activity className="h-5 w-5 text-velocity-volt" />
              <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Queue Health</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Pending" value={health.queue.pending} />
              <Metric label="Processing" value={health.queue.processing} />
              <Metric label="Completed 24h" value={health.queue.completed24h} />
              <Metric label="Failed" value={health.queue.failed} />
              <Metric label="Dead Letters" value={health.queue.deadLetters} />
              <Metric label="Stale Pending" value={health.queue.stalePending} />
            </div>
          </VelocityPanel>

          <VelocityPanel>
            <div className="mb-5 flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-velocity-volt" />
              <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Payout Health</h2>
            </div>
            <div className="grid gap-3">
              <Metric label="Queued Payouts" value={health.payouts.queued} />
              <Metric label="Failed Payouts" value={health.payouts.failed} />
              <Metric label="Held Payouts" value={health.payouts.held} />
            </div>
          </VelocityPanel>
        </div>

        <VelocityPanel>
          <div className="mb-5 flex items-center gap-2">
            <Server className="h-5 w-5 text-velocity-volt" />
            <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Service Connectivity</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(health.services).map(([name, service]) => (
              <div key={name} className="flex items-center justify-between rounded-velocity-sm border border-velocity-border bg-velocity-black/45 p-4">
                <div>
                  <div className="font-semibold capitalize">{name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-velocity-muted">
                    {service.configured ? "configured" : "not configured"}
                  </div>
                </div>
                <StatusDot status={service.status} />
              </div>
            ))}
          </div>
        </VelocityPanel>

        {health.warnings.length > 0 ? (
          <VelocityPanel>
            <div className="mb-5 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-velocity-amber" />
              <h2 className="font-mono text-sm uppercase tracking-[0.18em]">Runtime Warnings</h2>
            </div>
            <ul className="space-y-3">
              {health.warnings.map((warning) => (
                <li key={warning} className="rounded-velocity-sm border border-velocity-amber/30 bg-velocity-amber/10 p-3 text-sm text-velocity-white">
                  {warning}
                </li>
              ))}
            </ul>
          </VelocityPanel>
        ) : null}

        <VelocityPanel>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 text-sm text-velocity-muted">
              <Clock className="h-4 w-4 text-velocity-volt" />
              Snapshot: {new Date(health.timestamp).toLocaleString()}
            </div>
            <div className="flex items-center gap-3 text-sm text-velocity-muted">
              <Radio className="h-4 w-4 text-velocity-volt" />
              App: {health.deployment.appUrl}
            </div>
            <div className="text-sm text-velocity-muted">
              Build: {health.deployment.buildTime ?? "local"}
            </div>
          </div>
        </VelocityPanel>
      </div>
    </main>
  );
}
