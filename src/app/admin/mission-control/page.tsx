import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDateTime } from "@/lib/utils";
import { getTenantId } from "@/lib/tenancy";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { isRuntimePaused } from "@/lib/governance/operator";

function jobStatusColor(s: string) {
  if (s === "completed" || s === "customer_confirmed") return "text-green-400";
  if (["in_progress", "en_route", "arrived"].includes(s)) return "text-blue-400";
  if (["accepted", "scheduled"].includes(s)) return "text-violet-400";
  if (["cancelled", "failed"].includes(s)) return "text-red-400";
  if (s === "disputed") return "text-orange-400";
  return "text-white/50";
}

function runStatusBadge(s: string) {
  if (s === "success") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (s === "failed") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (s === "skipped") return "bg-white/10 text-white/40 border-white/10";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

function circuitBadge(state: string) {
  if (state === "closed") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (state === "open") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
}

export default async function AdminMissionControlPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const adminClient = await createAdminClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [
    jobsResult,
    activeDisputesResult,
    automationRunsResult,
    automationQueueResult,
    providerStatsResult,
    recentRevenueResult,
  ] = await Promise.all([
    // All jobs in last 24h
    adminClient
      .from("jobs")
      .select("id, status, title, category, urgency, created_at, final_cost_cents")
      .eq("tenant_id", tenantId)
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(200),

    // Open disputes
    adminClient
      .from("disputes")
      .select("id, status, reason, created_at")
      .eq("tenant_id", tenantId)
      .in("status", ["open", "under_review"])
      .order("created_at", { ascending: false })
      .limit(20),

    // Recent automation runs
    adminClient
      .from("automation_runs")
      .select("id, event_type, status, error, started_at, completed_at, actor_agent")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(50),

    // Automation queue depth
    adminClient
      .from("automation_queue")
      .select("id, event_type, status, created_at")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "processing"])
      .limit(30),

    // Provider counts
    adminClient
      .from("providers")
      .select("id, status")
      .eq("tenant_id", tenantId),

    // Revenue in last hour
    adminClient
      .from("revenue_records")
      .select("gross_amount_cents, event_type, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false }),
  ]);

  const jobs = jobsResult.data ?? [];
  const disputes = activeDisputesResult.data ?? [];
  const automationRuns = (automationRunsResult.data ?? []) as Array<{
    id: string; event_type: string; status: string; error: string | null;
    started_at: string; completed_at: string | null; actor_agent: string | null;
  }>;
  const queueItems = automationQueueResult.data ?? [];
  const providers = providerStatsResult.data ?? [];
  const recentRevenue = recentRevenueResult.data ?? [];

  // Job pipeline by status
  const statusGroups: Record<string, number> = {};
  for (const j of jobs) {
    statusGroups[j.status] = (statusGroups[j.status] ?? 0) + 1;
  }

  const activeJobs = jobs.filter((j) => ["in_progress", "en_route", "arrived", "accepted", "scheduled"].includes(j.status));
  const completedToday = jobs.filter((j) => ["completed", "customer_confirmed"].includes(j.status));
  const emergencyJobs = jobs.filter((j) => j.urgency === "emergency");
  const failedRuns = automationRuns.filter((r) => r.status === "failed");

  const approvedProviders = providers.filter((p) => p.status === "approved");
  const revenueHour = recentRevenue.reduce((s, r) => s + (r.gross_amount_cents ?? 0), 0);

  // Circuit breaker + operator state
  const circuits = getAllCircuits();
  const openCircuits = Object.entries(circuits).filter(([, s]) => s.state === "open");
  const systemPaused = isRuntimePaused();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Mission Control</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/executive" className="text-white/40 hover:text-white">Executive OS</Link>
          <Link href="/admin/intelligence" className="text-white/40 hover:text-white">Intelligence</Link>
          <Link href="/admin/command-center" className="text-white/40 hover:text-white">Command Center</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Enterprise Mission Control</h1>
            <p className="text-white/40 text-sm mt-1">
              Live operational state · Last 24 hours
            </p>
          </div>
          <div className="flex items-center gap-2">
            {systemPaused && <Badge className="bg-red-500/20 text-red-400 border-red-500/30">SYSTEM PAUSED</Badge>}
            {openCircuits.length > 0 && <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">{openCircuits.length} circuit{openCircuits.length !== 1 ? "s" : ""} open</Badge>}
            {emergencyJobs.length > 0 && <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{emergencyJobs.length} EMERGENCY</Badge>}
            {failedRuns.length === 0 && openCircuits.length === 0 && !systemPaused && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">All systems nominal</Badge>
            )}
          </div>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Active Jobs", value: activeJobs.length.toString(), color: activeJobs.length > 0 ? "text-blue-400" : "text-white/40" },
            { label: "Completed (24h)", value: completedToday.length.toString(), color: "text-green-400" },
            { label: "Open Disputes", value: disputes.length.toString(), color: disputes.length > 0 ? "text-orange-400" : "text-white/40" },
            { label: "Revenue (1h)", value: formatCents(revenueHour), color: revenueHour > 0 ? "text-[#CCFF00]" : "text-white/40" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Queue Depth", value: queueItems.length.toString(), color: queueItems.length > 10 ? "text-yellow-400" : "text-white/60" },
            { label: "Failed Runs (24h)", value: failedRuns.length.toString(), color: failedRuns.length > 0 ? "text-red-400" : "text-white/40" },
            { label: "Active Providers", value: approvedProviders.length.toString(), color: "text-white" },
            { label: "Emergency Jobs", value: emergencyJobs.length.toString(), color: emergencyJobs.length > 0 ? "text-red-400" : "text-white/40" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Job pipeline */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Job Pipeline (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.entries(statusGroups).length === 0 ? (
                <div className="text-white/30 text-sm py-4 text-center">No jobs in last 24 hours.</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(statusGroups)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-sm">
                        <span className={`capitalize ${jobStatusColor(status)}`}>{status.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#CCFF00]"
                              style={{ width: `${Math.round((count / jobs.length) * 100)}%` }}
                            />
                          </div>
                          <span className="text-white/60 w-6 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* System health */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">System Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Automation Engine</span>
                <Badge className={systemPaused ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-green-500/20 text-green-400 border-green-500/30"}>
                  {systemPaused ? "PAUSED" : "running"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Queue</span>
                <span className={queueItems.length > 20 ? "text-yellow-400" : "text-white/50"}>
                  {queueItems.length} pending
                </span>
              </div>
              {Object.entries(circuits).slice(0, 6).map(([name, state]) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="text-white/40 font-mono">{name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white/30">{state.failureCount} failures</span>
                    <Badge className={circuitBadge(state.state)}>{state.state}</Badge>
                  </div>
                </div>
              ))}
              {openCircuits.length > 0 && (
                <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                  ⚠ {openCircuits.length} circuit breaker{openCircuits.length !== 1 ? "s" : ""} open: {openCircuits.map(([n]) => n).join(", ")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Recent automation runs */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Recent Automation Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {automationRuns.length === 0 ? (
                <div className="text-white/30 text-sm py-4 text-center">No automation runs in last 24h.</div>
              ) : (
                <div className="space-y-2">
                  {automationRuns.slice(0, 15).map((run) => (
                    <div key={run.id} className="flex items-center justify-between text-xs gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-white/60 font-mono truncate block">{run.event_type}</span>
                        {run.error && <span className="text-red-400 truncate block">{run.error.slice(0, 60)}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-white/20">{new Date(run.started_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                        <Badge className={runStatusBadge(run.status)}>{run.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-white/10">
                <Link href="/admin/automation/logs" className="text-xs text-white/30 hover:text-[#CCFF00]">
                  Full automation log →
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Active disputes */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Open Disputes ({disputes.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {disputes.length === 0 ? (
                <div className="text-white/30 text-sm py-4 text-center">No open disputes. ✓</div>
              ) : (
                <div className="space-y-2">
                  {disputes.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-xs gap-2">
                      <Link href={`/admin/disputes/${d.id}`} className="text-white/60 hover:text-[#CCFF00] capitalize truncate max-w-[200px]">
                        {d.reason?.replace(/_/g, " ") ?? "—"}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-white/20">{formatDateTime(d.created_at)}</span>
                        <Badge className={d.status === "open" ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}>
                          {d.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-white/10">
                <Link href="/admin/disputes" className="text-xs text-white/30 hover:text-[#CCFF00]">
                  All disputes →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Emergency jobs alert */}
        {emergencyJobs.length > 0 && (
          <Card className="bg-red-900/20 border-red-500/30 text-white mb-6">
            <CardHeader>
              <CardTitle className="text-sm text-red-400">⚠ Emergency Jobs ({emergencyJobs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {emergencyJobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between text-xs">
                    <Link href={`/admin/jobs/${j.id}`} className="text-white/70 hover:text-red-400 truncate max-w-[250px]">
                      {j.title}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-white/30 capitalize">{j.status.replace(/_/g, " ")}</span>
                      <span className="text-white/20">{formatDateTime(j.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
