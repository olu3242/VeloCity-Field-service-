import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  scoreGovernanceHealth,
  recordHealthSnapshot,
  HEALTH_HISTORY,
  getHealthTrend,
} from "@/lib/autonomous-governance/governance-health";
import {
  getPolicyAnalyticsSummary,
  getUnderperformingPolicies,
} from "@/lib/autonomous-governance/policy-analytics";
import {
  detectDrift,
  getActiveDrifts,
  getDriftSummary,
} from "@/lib/autonomous-governance/drift-detector";
import { isRuntimePaused } from "@/lib/governance/operator";
import { getTenantId } from "@/lib/tenancy";

// ── Helpers ──────────────────────────────────────────────────────────────────

function healthLevelBadge(level: "healthy" | "degraded" | "critical"): string {
  switch (level) {
    case "healthy":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "degraded":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "critical":
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

function healthScoreColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function severityBadge(severity: "low" | "medium" | "high"): string {
  switch (severity) {
    case "low":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "medium":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "high":
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

function trendIcon(trend: "improving" | "stable" | "degrading"): string {
  switch (trend) {
    case "improving":
      return "↑";
    case "stable":
      return "→";
    case "degrading":
      return "↓";
  }
}

function trendColor(trend: "improving" | "stable" | "degrading"): string {
  switch (trend) {
    case "improving":
      return "text-green-400";
    case "stable":
      return "text-white/60";
    case "degrading":
      return "text-red-400";
  }
}

function driftTypeLabel(driftType: string): string {
  return driftType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminGovernancePage() {
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

  // All governance functions are synchronous/in-memory — call them directly
  const healthReport = scoreGovernanceHealth();
  recordHealthSnapshot();

  const trend = getHealthTrend();

  // Detect and retrieve drifts
  detectDrift();
  const activeDrifts = getActiveDrifts();
  const driftSummary = getDriftSummary();

  // Policy analytics
  const analyticsSummary = getPolicyAnalyticsSummary();
  const underperforming = getUnderperformingPolicies(0.8);

  // Runtime status
  const runtimePaused = isRuntimePaused();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">
            ⚡ Admin
          </Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Autonomous Governance</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/executive" className="text-white/40 hover:text-white">
            Executive
          </Link>
          <Link href="/admin/intelligence" className="text-white/40 hover:text-white">
            Intelligence
          </Link>
          <Link href="/admin/mission-control" className="text-white/40 hover:text-white">
            Mission Control
          </Link>
          <Link href="/admin/agents" className="text-white/40 hover:text-white">
            Agents
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Autonomous Governance Center</h1>
            <p className="text-white/40 text-sm mt-1">
              Health scoring · Policy analytics · Drift detection · Runtime controls
            </p>
          </div>
          <Badge
            className={runtimePaused
              ? "bg-red-500/20 text-red-400 border-red-500/30"
              : "bg-green-500/20 text-green-400 border-green-500/30"}
          >
            Runtime {runtimePaused ? "PAUSED" : "Active"}
          </Badge>
        </div>

        {/* Health Score + Trend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Big health number */}
          <Card className="bg-gray-900 border-white/10 text-white md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/50">Governance Health Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-6xl font-black mb-2 ${healthScoreColor(healthReport.score)}`}>
                {Math.round(healthReport.score)}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={healthLevelBadge(healthReport.level)}>
                  {healthReport.level.charAt(0).toUpperCase() + healthReport.level.slice(1)}
                </Badge>
                <span className={`text-sm font-semibold ${trendColor(trend)}`}>
                  {trendIcon(trend)} {trend.charAt(0).toUpperCase() + trend.slice(1)}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    healthReport.level === "healthy"
                      ? "bg-green-500"
                      : healthReport.level === "degraded"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${healthReport.score}%` }}
                />
              </div>
              <p className="text-xs text-white/30 mt-2">
                Snapshots recorded: {HEALTH_HISTORY.length}
              </p>
            </CardContent>
          </Card>

          {/* Health checks grid */}
          <Card className="bg-gray-900 border-white/10 text-white md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Health Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {healthReport.checks.map((check) => (
                  <div
                    key={check.name}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                      check.passed
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-red-500/20 bg-red-500/5"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{check.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                      <p className="text-xs text-white/40">Weight: {Math.round(check.weight * 100)}%</p>
                    </div>
                    <div
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        check.passed
                          ? "text-green-400 bg-green-500/10"
                          : "text-red-400 bg-red-500/10"
                      }`}
                    >
                      {check.passed ? "PASS" : "FAIL"}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/30 mt-3">Generated at {healthReport.generatedAt}</p>
            </CardContent>
          </Card>
        </div>

        {/* Drift Detection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Drift summary stats */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Drift Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Total Drifts Logged</span>
                <span className="font-bold">{driftSummary.total}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Active (Unresolved)</span>
                <span className={`font-bold ${driftSummary.active > 0 ? "text-yellow-400" : "text-white/30"}`}>
                  {driftSummary.active}
                </span>
              </div>
              <div className="pt-2 border-t border-white/10">
                <p className="text-xs text-white/30 uppercase tracking-wider mb-2">By Severity</p>
                {Object.entries(driftSummary.bySeverity).length === 0 ? (
                  <p className="text-xs text-white/30">No drifts recorded.</p>
                ) : (
                  Object.entries(driftSummary.bySeverity).map(([sev, count]) => (
                    <div key={sev} className="flex items-center justify-between text-xs mb-1">
                      <Badge className={severityBadge(sev as "low" | "medium" | "high")}>{sev}</Badge>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active drifts list */}
          <Card className="bg-gray-900 border-white/10 text-white md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Active Drifts
                {activeDrifts.length > 0 && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                    {activeDrifts.length} active
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeDrifts.length === 0 ? (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <span className="text-lg">✓</span>
                  <span>No active governance drifts detected.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDrifts.map((drift) => (
                    <div key={drift.id} className="flex items-start gap-3 rounded-lg p-3 bg-white/5 border border-white/10">
                      <Badge className={severityBadge(drift.severity)}>{drift.severity}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{driftTypeLabel(drift.driftType)}</p>
                        <p className="text-xs text-white/50 mt-0.5">{drift.detail}</p>
                        <p className="text-[10px] text-white/30 mt-1">{drift.detectedAt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Policy Analytics */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Policy Analytics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Summary stats */}
            <Card className="bg-gray-900 border-white/10 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Evaluation Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Total Evaluations</p>
                    <p className="text-2xl font-bold">{analyticsSummary.totalEvaluations}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Avg Pass Rate</p>
                    <p className={`text-2xl font-bold ${
                      analyticsSummary.avgPassRate >= 0.8
                        ? "text-green-400"
                        : analyticsSummary.avgPassRate >= 0.6
                        ? "text-yellow-400"
                        : "text-red-400"
                    }`}>
                      {analyticsSummary.totalEvaluations === 0
                        ? "—"
                        : `${Math.round(analyticsSummary.avgPassRate * 100)}%`}
                    </p>
                  </div>
                </div>
                {analyticsSummary.avgPassRate > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                      <span>Pass</span>
                      <span>Fail</span>
                    </div>
                    <div className="h-2 bg-red-500/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${Math.round(analyticsSummary.avgPassRate * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {analyticsSummary.mostEvaluated && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Most Evaluated Policy</p>
                    <p className="text-sm font-medium text-[#CCFF00]">{analyticsSummary.mostEvaluated.policyId}</p>
                    <p className="text-xs text-white/40">
                      {analyticsSummary.mostEvaluated.evaluationCount} evaluations ·{" "}
                      {Math.round(analyticsSummary.mostEvaluated.passRate * 100)}% pass rate
                    </p>
                  </div>
                )}
                {analyticsSummary.totalEvaluations === 0 && (
                  <p className="text-xs text-white/30">No policy evaluations recorded in this session.</p>
                )}
              </CardContent>
            </Card>

            {/* Underperforming policies */}
            <Card className="bg-gray-900 border-white/10 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Underperforming Policies
                  <span className="text-xs text-white/30">(pass rate &lt; 80%)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {underperforming.length === 0 ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <span>✓</span>
                    <span>All active policies meeting pass-rate threshold.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {underperforming.map((p) => (
                      <div key={p.policyId} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
                        <div>
                          <p className="font-medium text-orange-300">{p.policyId}</p>
                          <p className="text-xs text-white/40">{p.evaluationCount} evaluations</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-orange-400">
                            {Math.round(p.passRate * 100)}%
                          </p>
                          <p className="text-xs text-white/30">pass rate</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Runtime Status */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Runtime Status
          </h2>
          <Card className={`border text-white ${runtimePaused ? "bg-red-950/40 border-red-500/30" : "bg-gray-900 border-white/10"}`}>
            <CardContent className="flex items-center gap-4 pt-4 pb-4">
              <div className={`w-3 h-3 rounded-full ${runtimePaused ? "bg-red-500 animate-pulse" : "bg-green-500"}`} />
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  Automation Runtime is{" "}
                  <span className={runtimePaused ? "text-red-400" : "text-green-400"}>
                    {runtimePaused ? "PAUSED" : "Running"}
                  </span>
                </p>
                <p className="text-xs text-white/40 mt-0.5">
                  {runtimePaused
                    ? "All automation events are being held. Use operator controls to resume."
                    : "All automation agents and event processors are active."}
                </p>
              </div>
              <Link
                href="/admin/mission-control"
                className="text-xs text-[#CCFF00] hover:text-[#CCFF00]/80 transition-colors"
              >
                Manage Runtime →
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
