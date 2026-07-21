import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { formatCents } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { calculateCityReadinessScore } from "@/lib/expansion/cityReadinessScore";
import { calculateTerritoryOpportunityScore } from "@/lib/expansion/territoryOpportunityScore";
import { computeMarketDemand } from "@/lib/expansion/marketDemandIntelligence";
import { analyzeSupplyGap } from "@/lib/expansion/supplyGapAnalysis";
import type { ServiceCategory } from "@/types";
import type { ScoreResult } from "@/lib/scoring/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function levelColor(level: ScoreResult["level"]): string {
  if (level === "critical") return "text-green-400";
  if (level === "high") return "text-blue-400";
  if (level === "medium") return "text-yellow-400";
  return "text-red-400";
}

function levelBadgeClass(level: ScoreResult["level"]): string {
  if (level === "critical") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (level === "high") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (level === "medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

function statusBadgeClass(status: string): string {
  if (status === "active") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "pending") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (status === "suspended") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-white/10 text-white/40 border-white/10";
}

function severityBadgeClass(severity: string): string {
  if (severity === "high") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (severity === "medium") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-green-500/20 text-green-400 border-green-500/30";
}

function scoreBar(score: number): string {
  const w = Math.max(0, Math.min(100, score));
  if (w >= 75) return "bg-green-500";
  if (w >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Territory {
  id: string;
  name: string;
  zip_codes: string[] | null;
  status: string;
}

interface TerritoryEnriched {
  territory: Territory;
  providerCount: number;
  readiness: ScoreResult;
  opportunity: ScoreResult;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminExpansionPage() {
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

  // Supabase data fetches
  const adminClient = await createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: territories },
    { data: approvedProviders },
    { data: recentJobs },
    { count: customerCount },
  ] = await Promise.all([
    adminClient
      .from("franchise_territories")
      .select("id, name, zip_codes, status")
      .eq("tenant_id", tenantId)
      .limit(10),
    adminClient
      .from("providers")
      .select("id, tenant_id")
      .eq("status", "approved")
      .eq("tenant_id", tenantId),
    adminClient
      .from("jobs")
      .select("id, category, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", thirtyDaysAgo),
    adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer")
      .eq("tenant_id", tenantId),
  ]);

  const territoriesData: Territory[] = territories ?? [];
  const totalProviderCount = approvedProviders?.length ?? 0;
  const totalCustomers = customerCount ?? 0;

  // Monthly revenue approximation: count jobs * avg job value
  const totalJobs30d = recentJobs?.length ?? 0;
  const monthlyRevenueCents = totalJobs30d * 18000; // ~$180 avg job

  // Demand index approximation: 0–100 based on job volume
  const demandIndex = Math.min(100, (totalJobs30d / 5));

  // Enrich territories with scores
  const enriched: TerritoryEnriched[] = territoriesData.map((t) => {
    const zipCount = t.zip_codes?.length ?? 0;

    // Rough provider count per territory: divide total by territory count
    const providerCount =
      territoriesData.length > 0
        ? Math.floor(totalProviderCount / territoriesData.length)
        : 0;

    const activeCustomers =
      territoriesData.length > 0
        ? Math.floor(totalCustomers / territoriesData.length)
        : 0;

    const territoryRevenueCents =
      territoriesData.length > 0
        ? Math.floor(monthlyRevenueCents / territoriesData.length)
        : 0;

    const readiness = calculateCityReadinessScore({
      demandIndex,
      providerCount,
      activeCustomers,
      monthlyRevenueCents: territoryRevenueCents,
    });

    const providerGap = Math.max(0, Math.ceil(demandIndex / 10) - providerCount);

    const opportunity = calculateTerritoryOpportunityScore({
      demandIndex,
      providerGap,
      medianIncomeIndex: 65,
      competitionIndex: 35,
    });

    return { territory: t, providerCount, readiness, opportunity };
  });

  // Overall platform readiness (avg of territory scores)
  const overallReadiness =
    enriched.length > 0
      ? Math.round(enriched.reduce((s, e) => s + e.readiness.score, 0) / enriched.length)
      : 0;

  // Market demand: compute for first territory (representative sample)
  const primaryTerritoryId = territoriesData[0]?.id;
  const demandReports = primaryTerritoryId
    ? await computeMarketDemand(primaryTerritoryId)
    : [];

  // Top 6 categories by actual job count
  const topDemandCategories = [...demandReports]
    .sort((a, b) => b.actualJobs - a.actualJobs)
    .slice(0, 6);

  // Supply gap analysis for top categories
  const supplyGaps = topDemandCategories.map((d) =>
    analyzeSupplyGap({
      category: d.category as ServiceCategory,
      expectedJobs: d.expectedJobs,
      activeProviders: Math.floor(totalProviderCount / Math.max(topDemandCategories.length, 1)),
    })
  );

  // Synthesize expansion recommendations
  const highOpportunity = enriched.filter((e) => e.opportunity.score >= 65);
  const highReadiness = enriched.filter((e) => e.readiness.score >= 65);
  const highGapCategories = supplyGaps.filter((g) => g.severity === "high");

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ── */}
      <div className="border-b border-white/10 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Market Expansion Intelligence</h1>
            <p className="text-xs text-white/40 mt-0.5">Territory readiness, demand analysis, supply gaps</p>
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
            <Link
              href="/admin/analytics"
              className="px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Analytics
            </Link>
            <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white font-medium">Expansion</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* ── Section: Platform-Wide Readiness ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
            Platform Expansion Readiness
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              variant="dark"
              label="Active Territories"
              value={territoriesData.length}
              hint="Franchise territories"
            />
            <StatCard
              variant="dark"
              label="Approved Providers"
              value={totalProviderCount.toLocaleString()}
              hint="Platform-wide"
            />
            <StatCard
              variant="dark"
              label="Total Customers"
              value={totalCustomers.toLocaleString()}
              hint="Registered accounts"
            />
            <StatCard
              variant="dark"
              label="Overall Readiness"
              value={overallReadiness}
              hint="Avg territory score / 100"
              valueClassName={
                overallReadiness >= 70
                  ? "text-green-400"
                  : overallReadiness >= 45
                  ? "text-yellow-400"
                  : "text-red-400"
              }
            />
          </div>
        </section>

        {/* ── Section: Territory Cards ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
            Territory Breakdown
          </h2>
          {enriched.length === 0 ? (
            <Card className="bg-gray-900 border-white/10">
              <CardContent className="py-10 text-center text-sm text-white/30">
                No franchise territories configured.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {enriched.map(({ territory, providerCount, readiness, opportunity }) => (
                <Card key={territory.id} className="bg-gray-900 border-white/10 hover:border-white/20 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm text-white leading-snug">{territory.name}</CardTitle>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(territory.status)}`}
                      >
                        {territory.status}
                      </span>
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                      {territory.zip_codes?.length ?? 0} zip codes · {providerCount} providers
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Readiness score bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-white/40">City Readiness</span>
                        <span className={`text-xs font-semibold ${levelColor(readiness.level)}`}>
                          {readiness.score} / 100
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${scoreBar(readiness.score)}`}
                          style={{ width: `${readiness.score}%` }}
                        />
                      </div>
                    </div>
                    {/* Opportunity score bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-white/40">Opportunity Score</span>
                        <span className={`text-xs font-semibold ${levelColor(opportunity.level)}`}>
                          {opportunity.score} / 100
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${scoreBar(opportunity.score)}`}
                          style={{ width: `${opportunity.score}%` }}
                        />
                      </div>
                    </div>
                    {/* Level badges */}
                    <div className="flex gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${levelBadgeClass(readiness.level)}`}>
                        Readiness: {readiness.level}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${levelBadgeClass(opportunity.level)}`}>
                        Opportunity: {opportunity.level}
                      </span>
                    </div>
                    {/* Top recommendation */}
                    {readiness.recommendations[0] && (
                      <p className="text-xs text-white/40 italic leading-snug">
                        {readiness.recommendations[0]}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ── Section: Market Demand by Category ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">
              Market Demand by Category
            </h2>
            {primaryTerritoryId && (
              <span className="text-xs text-white/30">Primary territory · last 30 days</span>
            )}
          </div>
          <Card className="bg-gray-900 border-white/10">
            <CardContent className="overflow-x-auto p-0">
              {topDemandCategories.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-white/30">
                  No demand data available. Configure a territory with zip codes to compute demand.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-white/40 font-medium">Category</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Jobs (30d)</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Prior Period</th>
                      <th className="text-right px-4 py-2 text-white/40 font-medium">Growth</th>
                      <th className="text-left px-4 py-2 text-white/40 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDemandCategories.map((d) => {
                      const growth = d.demandGrowthRate;
                      const isPositive = growth > 0;
                      const isFlat = Math.abs(growth) < 0.05;
                      return (
                        <tr key={d.category} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2 font-medium text-white capitalize">
                            {d.category.replace(/_/g, " ")}
                          </td>
                          <td className="px-4 py-2 text-right text-white/80">{d.actualJobs}</td>
                          <td className="px-4 py-2 text-right text-white/50">{d.expectedJobs}</td>
                          <td
                            className={`px-4 py-2 text-right font-semibold ${
                              isFlat ? "text-white/40" : isPositive ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {(growth * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-block text-xs font-medium ${
                                isFlat
                                  ? "text-white/30"
                                  : isPositive
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}
                            >
                              {isFlat ? "→ stable" : isPositive ? "↑ growing" : "↓ declining"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Section: Supply Gap Analysis ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
            Supply Gap Analysis
          </h2>
          {supplyGaps.length === 0 ? (
            <Card className="bg-gray-900 border-white/10">
              <CardContent className="py-8 text-center text-sm text-white/30">
                No supply gap data — demand data required.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {supplyGaps.map((gap) => (
                <Card key={gap.category} className="bg-gray-900 border-white/10">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className="text-sm font-medium text-white capitalize">
                        {gap.category.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${severityBadgeClass(gap.severity)}`}
                      >
                        {gap.severity}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                      {gap.providersNeeded}
                      <span className="text-sm font-normal text-white/40 ml-1">providers needed</span>
                    </div>
                    <p className="text-xs text-white/40 leading-snug">{gap.explanation}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ── Section: Expansion Recommendations ── */}
        <section>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">
            Expansion Recommendations
          </h2>
          <div className="space-y-3">
            {highReadiness.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                <span className="mt-0.5 shrink-0 text-green-400 font-bold">✓</span>
                <span>
                  <strong>{highReadiness.map((e) => e.territory.name).join(", ")}</strong>{" "}
                  {highReadiness.length === 1 ? "has" : "have"} high readiness scores. These territories are ready for franchise launch or accelerated growth.
                </span>
              </div>
            )}

            {highOpportunity.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
                <span className="mt-0.5 shrink-0 text-blue-400 font-bold">↑</span>
                <span>
                  <strong>{highOpportunity.map((e) => e.territory.name).join(", ")}</strong>{" "}
                  {highOpportunity.length === 1 ? "shows" : "show"} elevated opportunity scores. Prioritize provider recruitment and demand capture campaigns.
                </span>
              </div>
            )}

            {highGapCategories.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
                <span className="mt-0.5 shrink-0 text-yellow-400 font-bold">!</span>
                <span>
                  Critical supply gaps in{" "}
                  <strong>
                    {highGapCategories.map((g) => g.category.replace(/_/g, " ")).join(", ")}
                  </strong>
                  . Immediate provider onboarding is recommended to avoid demand leakage.
                </span>
              </div>
            )}

            {enriched.some((e) => e.readiness.level === "low") && (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <span className="mt-0.5 shrink-0 text-red-400 font-bold">✗</span>
                <span>
                  {enriched
                    .filter((e) => e.readiness.level === "low")
                    .map((e) => e.territory.name)
                    .join(", ")}{" "}
                  require foundational investment before expansion. Focus on provider density and customer acquisition before franchise licensing.
                </span>
              </div>
            )}

            {highReadiness.length === 0 &&
              highOpportunity.length === 0 &&
              highGapCategories.length === 0 &&
              !enriched.some((e) => e.readiness.level === "low") && (
                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/50">
                  <span className="mt-0.5 shrink-0">&#9432;</span>
                  All territories are in standard operating range. Continue monitoring demand trends and provider performance.
                </div>
              )}

            {/* Synthesized recommendation from territory scores */}
            {enriched.length > 0 && (
              <div className="mt-2 rounded-xl border border-white/10 bg-gray-900 px-4 py-4">
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Territory-Level Recommendations
                </h3>
                <ul className="space-y-2">
                  {enriched
                    .flatMap((e) => [
                      ...e.readiness.recommendations.slice(0, 1).map((r) => ({
                        territory: e.territory.name,
                        rec: r,
                      })),
                      ...e.opportunity.recommendations.slice(0, 1).map((r) => ({
                        territory: e.territory.name,
                        rec: r,
                      })),
                    ])
                    .slice(0, 6)
                    .map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                        <span className="shrink-0 mt-0.5 text-white/30">›</span>
                        <span>
                          <strong className="text-white/80">{item.territory}:</strong> {item.rec}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
