import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { formatCents, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  getRecentSnapshots,
  getThroughputTrend,
  getEffectivenessReport,
} from "@/lib/analytics/throughput-dashboard";
import {
  getTopProviders,
  getAtRiskProviders,
} from "@/lib/analytics/provider-analytics";
import {
  getTopWorkflows,
  getEffectivenessScore,
} from "@/lib/analytics/workflow-analytics";
import {
  getPayoutAnalytics,
  getDisputeAnalytics,
  getPlatformDisputeRate,
} from "@/lib/analytics/payout-dispute-analytics";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trendBadgeClass(trend: "improving" | "stable" | "degrading"): string {
  if (trend === "improving") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (trend === "degrading") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-white/10 text-white/40 border-white/10";
}

function tierBadgeClass(tier: string): string {
  if (tier === "top") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (tier === "standard") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (tier === "at_risk") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function severityColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function pct(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

function ms(value: number): string {
  if (value >= 1000) return (value / 1000).toFixed(1) + "s";
  return Math.round(value) + "ms";
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminAnalyticsPage() {
  // Auth & role gate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  // Analytics data (in-memory analytics libs)
  const snapshots = getRecentSnapshots(20);
  const trend = getThroughputTrend();
  const effectivenessReport = getEffectivenessReport();
  const workflowScore = getEffectivenessScore();
  const topProviders = getTopProviders(tenantId, 8);
  const atRiskProviders = getAtRiskProviders();
  const topWorkflows = getTopWorkflows(8);
  const payoutAnalytics = getPayoutAnalytics(tenantId);
  const disputeAnalytics = getDisputeAnalytics(tenantId);
  const platformDisputeRate = getPlatformDisputeRate();

  // Latest throughput snapshot for headline stats
  const latestSnap = snapshots[snapshots.length - 1];

  // Supabase: 30-day automation_runs totals
  const adminClient = await createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: automationRuns } = await adminClient
    .from("automation_runs")
    .select("status, duration_ms")
    .gte("created_at", thirtyDaysAgo);

  const totalRuns = automationRuns?.length ?? 0;
  const successfulRuns = automationRuns?.filter((r) => r.status === "success").length ?? 0;
  const failedRuns = automationRuns?.filter((r) => r.status === "failed").length ?? 0;
  const avgDuration =
    totalRuns > 0
      ? (automationRuns ?? []).reduce((s, r) => s + (r.duration_ms ?? 0), 0) / totalRuns
      : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="border-b border-white/10 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Analytics Command Center</h1>
            <p className="text-xs text-white/40 mt-0.5">Platform throughput, provider health, workflow effectiveness</p>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/admin/executive"
              className="px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Executive
            </Link>
            <Link
              href="/admin/intelligence"
              className="px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Intelligence
            </Link>
            <Link
              href="/admin/mission-control"
              className="px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Mission Control
            </Link>
            <Link
              href="/admin/agents"
              className="px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Agents
            </Link>
            <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white font-medium">Analytics</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* ── Section: Platform Throughput ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">
              Platform Throughput
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${trendBadgeClass(trend)}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  trend === "improving"
                    ? "bg-green-400"
                    : trend === "degrading"
                    ? "bg-red-400"
                    : "bg-white/40"
                }`}
              />
              {trend}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              variant="dark"
              label="Events / min"
              value={latestSnap ? latestSnap.eventsPerMinute.toFixed(1) : "—"}
              hint="Latest snapshot"
            />
            <StatCard
              variant="dark"
              label="Failure Rate"
              value={latestSnap ? pct(latestSnap.failureRate) : "—"}
              hint="Latest snapshot"
              valueClassName={
                latestSnap && latestSnap.failureRate > 0.05 ? "text-red-400" : "text-green-400"
              }
            />
            <StatCard
              variant="dark"
              label="Queue Depth"
              value={latestSnap ? latestSnap.queueDepth.toLocaleString() : "—"}
              hint="Latest snapshot"
            />
            <StatCard
              variant="dark"
              label="Active Workers"
              value={latestSnap ? latestSnap.activeWorkers : "—"}
              hint="Latest snapshot"
            />
          </div>

          {/* Snapshot mini-table */}
          {snapshots.length > 0 && (
            <Card className="mt-4 bg-gray-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white/70">Recent Snapshots (last {snapshots.length})</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-white/40 font-medium">Timestamp</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Ev/min</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Failure</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Queue</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...snapshots].reverse().slice(0, 8).map((snap, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2 text-white/60">{formatDateTime(snap.timestamp)}</td>
                        <td className="px-4 py-2 text-right text-white/80">{snap.eventsPerMinute.toFixed(1)}</td>
                        <td className={`px-4 py-2 text-right ${snap.failureRate > 0.05 ? "text-red-400" : "text-green-400"}`}>
                          {pct(snap.failureRate)}
                        </td>
                        <td className="px-4 py-2 text-right text-white/80">{snap.queueDepth}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${severityColor(snap.effectivenessScore)}`}>
                          {snap.effectivenessScore.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </section>

        {/* ── Section: Effectiveness Report ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
            Effectiveness Report
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              variant="dark"
              label="Effectiveness Score"
              value={effectivenessReport.current.toFixed(1)}
              hint={`Trend: ${effectivenessReport.trend}`}
              valueClassName={severityColor(effectivenessReport.current)}
            />
            <StatCard
              variant="dark"
              label="30-day Automation Runs"
              value={totalRuns.toLocaleString()}
              hint={`${successfulRuns} succeeded · ${failedRuns} failed`}
            />
            <StatCard
              variant="dark"
              label="Avg Run Duration"
              value={ms(avgDuration)}
              hint="30-day average"
            />
          </div>
          {effectivenessReport.recommendation && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
              <span className="mt-0.5 shrink-0 text-blue-400">&#9432;</span>
              {effectivenessReport.recommendation}
            </div>
          )}
        </section>

        {/* ── Section: Workflow Effectiveness Score ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">
              Workflow Effectiveness
            </h2>
            <span
              className={`text-2xl font-bold tabular-nums ${severityColor(workflowScore)}`}
            >
              {workflowScore.toFixed(0)} <span className="text-sm font-normal text-white/40">/ 100</span>
            </span>
          </div>

          {/* Top Workflows Table */}
          <Card className="bg-gray-900 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/70">Top Workflows</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {topWorkflows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-white/30">No workflow data recorded yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-white/40 font-medium">Workflow ID</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Runs</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Success</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Avg Duration</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">P95</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Avg Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topWorkflows.map((wf) => (
                      <tr key={wf.workflowId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2 font-mono text-white/60 max-w-[180px] truncate" title={wf.workflowId}>
                          {wf.workflowId.length > 20 ? wf.workflowId.slice(0, 8) + "…" + wf.workflowId.slice(-6) : wf.workflowId}
                        </td>
                        <td className="px-4 py-2 text-right text-white/80">{wf.totalRuns.toLocaleString()}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${wf.successRate >= 0.9 ? "text-green-400" : wf.successRate >= 0.7 ? "text-yellow-400" : "text-red-400"}`}>
                          {pct(wf.successRate)}
                        </td>
                        <td className="px-4 py-2 text-right text-white/60">{ms(wf.avgDurationMs)}</td>
                        <td className="px-4 py-2 text-right text-white/60">{ms(wf.p95DurationMs)}</td>
                        <td className="px-4 py-2 text-right text-white/60">${wf.avgCostUsd.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Section: Top Providers ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">
              Top Providers
            </h2>
            {atRiskProviders.length > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                {atRiskProviders.length} at-risk
              </Badge>
            )}
          </div>
          <Card className="bg-gray-900 border-white/10">
            <CardContent className="overflow-x-auto p-0">
              {topProviders.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-white/30">No provider data recorded yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-white/40 font-medium">Provider ID</th>
                      <th className="text-center px-4 py-2 text-white/40 font-medium">Tier</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Composite</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Performance</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Reliability</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Satisfaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProviders.map((p) => (
                      <tr key={p.providerId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2 font-mono text-white/60">
                          {p.providerId.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${tierBadgeClass(p.tier)}`}>
                            {p.tier.replace("_", " ")}
                          </span>
                        </td>
                        <td className={`px-4 py-2 text-right font-bold ${severityColor(p.compositeScore)}`}>
                          {p.compositeScore.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 text-right text-white/60">{p.performanceScore.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-white/60">{p.reliabilityScore.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-white/60">{p.satisfactionScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Section: Payout & Dispute Analytics ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
            Payout &amp; Dispute Analytics
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payout Card */}
            <Card className="bg-gray-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white/70">Payouts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {payoutAnalytics.totalPayouts.toLocaleString()}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Total Payouts</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      ${payoutAnalytics.totalVolumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Total Volume</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${payoutAnalytics.successRate >= 0.95 ? "text-green-400" : "text-yellow-400"}`}>
                      {pct(payoutAnalytics.successRate)}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Success Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {ms(payoutAnalytics.avgProcessingMs)}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Avg Processing Time</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dispute Card */}
            <Card className="bg-gray-900 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white/70">Disputes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {disputeAnalytics.totalDisputes.toLocaleString()}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Total Disputes</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${platformDisputeRate <= 0.02 ? "text-green-400" : platformDisputeRate <= 0.05 ? "text-yellow-400" : "text-red-400"}`}>
                      {(platformDisputeRate * 100).toFixed(2)}%
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Platform Dispute Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-400">
                      {pct(disputeAnalytics.autoResolvedRate)}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Auto-Resolved</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {ms(disputeAnalytics.avgResolutionMs)}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Avg Resolution Time</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">
                      {pct(disputeAnalytics.winRate)}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Win Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      ${disputeAnalytics.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Total Dispute Value</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
