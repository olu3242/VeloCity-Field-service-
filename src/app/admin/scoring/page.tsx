import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { calculateProviderTrustScore } from "@/lib/scoring/providerTrustScore";
import { calculateCustomerTrustScore } from "@/lib/scoring/customerTrustScore";
import { calculateDispatchConfidenceScore } from "@/lib/scoring/dispatchConfidenceScore";
import { calculateRetentionProbabilityScore } from "@/lib/scoring/retentionScore";
import { calculateDisputeRiskScore } from "@/lib/scoring/disputeRiskScore";
import type { ScoreResult } from "@/lib/scoring/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function levelBadge(level: ScoreResult["level"]): string {
  switch (level) {
    case "low":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "medium":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "high":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "critical":
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

function scoreBarColor(level: ScoreResult["level"]): string {
  switch (level) {
    case "low":
      return "bg-green-500";
    case "medium":
      return "bg-yellow-500";
    case "high":
      return "bg-orange-500";
    case "critical":
      return "bg-red-500";
  }
}

function levelLabel(level: ScoreResult["level"]): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function countByLevel(results: ScoreResult[]): Record<ScoreResult["level"], number> {
  const counts: Record<ScoreResult["level"], number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of results) counts[r.level]++;
  return counts;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminScoringPage() {
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

  const adminClient = await createAdminClient();

  const [providersResult, customersResult] = await Promise.all([
    adminClient
      .from("providers")
      .select("id, business_name, trust_score, completed_jobs, cancellation_rate, avg_rating")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .limit(10),
    adminClient
      .from("profiles")
      .select("id, full_name, total_jobs_completed, average_rating, dispute_count")
      .eq("role", "customer")
      .eq("tenant_id", tenantId)
      .limit(5),
  ]);

  const providers = providersResult.data ?? [];
  const customers = customersResult.data ?? [];

  // Score each provider
  const providerScores = providers.map((p) => ({
    id: p.id as string,
    name: (p.business_name as string) ?? "Unknown",
    result: calculateProviderTrustScore({
      trustScore: (p.trust_score as number | null) ?? undefined,
      completedJobs: (p.completed_jobs as number | null) ?? undefined,
      cancellationRate: (p.cancellation_rate as number | null) ?? undefined,
      averageRating: (p.avg_rating as number | null) ?? undefined,
      isApproved: true,
    }),
  }));

  // Score each customer
  const customerScores = customers.map((c) => ({
    id: c.id as string,
    name: (c.full_name as string) ?? c.id,
    result: calculateCustomerTrustScore({
      completedJobs: (c.total_jobs_completed as number | null) ?? undefined,
      averageRatingGiven: (c.average_rating as number | null) ?? undefined,
      disputesOpened: (c.dispute_count as number | null) ?? undefined,
    }),
  }));

  // Demo composite scores at representative mid-tier values
  const demoDispatch = calculateDispatchConfidenceScore({
    providerTrustScore: 68,
    categoryMatch: true,
    serviceAreaMatch: true,
    isOnline: true,
    etaMinutes: 22,
    activeJobs: 1,
  });

  const demoRetention = calculateRetentionProbabilityScore({
    daysSinceLastJob: 45,
    completedJobs: 6,
    lastRating: 4.2,
    openDisputes: 0,
    hasSubscription: false,
    recurringCategory: true,
  });

  const demoDisputeRisk = calculateDisputeRiskScore({
    jobRiskScore: 35,
    quoteFairnessScore: 72,
    providerTrustScore: 68,
    customerTrustScore: 74,
    hasChangeOrder: false,
    completionConfirmed: false,
  });

  // Distribution across all scored entities
  const allScores = [
    ...providerScores.map((ps) => ps.result),
    ...customerScores.map((cs) => cs.result),
  ];
  const distribution = countByLevel(allScores);

  const scoreTypes = [
    {
      name: "Provider Trust",
      description: "Aggregates baseline trust, completed jobs, cancellation rate, and response time to determine how reliably a provider will deliver.",
      inverted: true,
    },
    {
      name: "Customer Trust",
      description: "Scores booking history, disputes, and payment failures to surface customers who may require extra verification or deposits.",
      inverted: true,
    },
    {
      name: "Dispatch Confidence",
      description: "Combines provider trust, category match, service-area fit, and availability to recommend the optimal dispatch target.",
      inverted: true,
    },
    {
      name: "Retention Probability",
      description: "Predicts how likely a customer is to return based on recency, booking frequency, rating history, and subscription status.",
      inverted: true,
    },
    {
      name: "Dispute Risk",
      description: "Estimates the likelihood of a dispute emerging from a given job by weighing quote fairness, provider/customer trust, and job complexity.",
      inverted: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">
            ⚡ Admin
          </Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Trust &amp; Scoring Center</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/executive" className="text-white/40 hover:text-white">
            Executive
          </Link>
          <Link href="/admin/intelligence" className="text-white/40 hover:text-white">
            Intelligence
          </Link>
          <Link href="/admin/agents" className="text-white/40 hover:text-white">
            Agents
          </Link>
          <Link href="/admin/certification" className="text-white/40 hover:text-white">
            Certification
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Trust &amp; Scoring Center</h1>
          <p className="text-white/40 text-sm mt-1">
            Live scoring for providers and customers · Score methodology · Dispatch and risk composites
          </p>
        </div>

        {/* Score Methodology Overview */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Score Methodology
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scoreTypes.map((st) => (
              <Card key={st.name} className="bg-gray-900 border-white/10 text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {st.name}
                    <Badge className="text-[10px] bg-white/10 text-white/50 border-white/10">
                      {st.inverted ? "higher = better" : "lower = better"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-white/50 leading-relaxed">{st.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Provider Trust Scores */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Provider Trust Scores ({providerScores.length} approved)
          </h2>
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardContent className="p-0">
              {providerScores.length === 0 ? (
                <p className="text-white/40 text-sm p-6">No approved providers found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-xs">
                      <th className="text-left px-4 py-3">Provider</th>
                      <th className="text-left px-4 py-3">Score</th>
                      <th className="text-left px-4 py-3">Level</th>
                      <th className="text-left px-4 py-3 hidden md:table-cell">Top Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerScores.map((ps) => (
                      <tr key={ps.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/admin/providers/${ps.id}`} className="hover:text-[#CCFF00] transition-colors">
                            {ps.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold w-8 text-right">{ps.result.score}</span>
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden w-20">
                              <div
                                className={`h-full rounded-full ${scoreBarColor(ps.result.level)}`}
                                style={{ width: `${ps.result.score}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={levelBadge(ps.result.level)}>
                            {levelLabel(ps.result.level)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs hidden md:table-cell">
                          {ps.result.reasons[0] ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Customer Trust Scores */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Customer Trust Scores ({customerScores.length} sampled)
          </h2>
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardContent className="p-0">
              {customerScores.length === 0 ? (
                <p className="text-white/40 text-sm p-6">No customer profiles found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-xs">
                      <th className="text-left px-4 py-3">Customer</th>
                      <th className="text-left px-4 py-3">Score</th>
                      <th className="text-left px-4 py-3">Level</th>
                      <th className="text-left px-4 py-3 hidden md:table-cell">Top Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerScores.map((cs) => (
                      <tr key={cs.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/admin/customers/${cs.id}`} className="hover:text-[#CCFF00] transition-colors">
                            {cs.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold w-8 text-right">{cs.result.score}</span>
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden w-20">
                              <div
                                className={`h-full rounded-full ${scoreBarColor(cs.result.level)}`}
                                style={{ width: `${cs.result.score}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={levelBadge(cs.result.level)}>
                            {levelLabel(cs.result.level)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs hidden md:table-cell">
                          {cs.result.reasons[0] ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Score Distribution Summary */}
        {allScores.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
              Score Distribution ({allScores.length} entities scored)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(["low", "medium", "high", "critical"] as const).map((lvl) => (
                <Card key={lvl} className="bg-gray-900 border-white/10 text-white">
                  <CardContent className="pt-4 pb-4 text-center">
                    <div className={`text-3xl font-bold mb-1 ${
                      lvl === "low" ? "text-green-400" :
                      lvl === "medium" ? "text-yellow-400" :
                      lvl === "high" ? "text-orange-400" :
                      "text-red-400"
                    }`}>
                      {distribution[lvl]}
                    </div>
                    <div className="text-xs text-white/40 capitalize">{lvl}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Demo Composite: Sample Dispatch Scenario */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Sample Dispatch Scenario — Mid-Tier Provider
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "Dispatch Confidence",
                subtitle: "Category + area match, online, 22-min ETA",
                result: demoDispatch,
              },
              {
                title: "Retention Probability",
                subtitle: "45 days since last job, 6 completed, no subscription",
                result: demoRetention,
              },
              {
                title: "Dispute Risk",
                subtitle: "Mid-tier quotes, no change order, pending confirmation",
                result: demoDisputeRisk,
              },
            ].map(({ title, subtitle, result }) => (
              <Card key={title} className="bg-gray-900 border-white/10 text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    {title}
                    <Badge className={levelBadge(result.level)}>{levelLabel(result.level)}</Badge>
                  </CardTitle>
                  <p className="text-xs text-white/40">{subtitle}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/40">Score</span>
                      <span className="font-bold text-lg">{result.score}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreBarColor(result.level)}`}
                        style={{ width: `${result.score}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    {result.reasons.map((r, i) => (
                      <p key={i} className="text-xs text-white/50">· {r}</p>
                    ))}
                  </div>
                  {result.recommendations.length > 0 && (
                    <div className="pt-2 border-t border-white/10">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Recommendations</p>
                      {result.recommendations.slice(0, 2).map((rec, i) => (
                        <p key={i} className="text-xs text-[#CCFF00]/70">→ {rec}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
