import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";
import { getTenantId } from "@/lib/tenancy";
import { computeExecutiveIntelligence } from "@/lib/governance/executiveIntelligence";
import { computeRecurringRevenueIntelligence } from "@/lib/membership/membershipRevenueIntelligence";
import { computeCommercialRevenueIntelligence } from "@/lib/commercial/commercialRevenueIntelligence";

function healthColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function trendBadge(val: number, inverted = false) {
  const positive = inverted ? val < 0 : val > 0;
  return positive ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30";
}

export default async function AdminExecutivePage() {
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
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const previousPeriodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [
    execIntelligence,
    recurringRevenue,
    commercialRevenue,
    revenueResult,
    prevRevenueResult,
    jobsResult,
    activeProviders,
    activeCustomers,
    franchiseRoyaltyResult,
  ] = await Promise.all([
    computeExecutiveIntelligence(tenantId),
    computeRecurringRevenueIntelligence(tenantId),
    computeCommercialRevenueIntelligence(tenantId),
    // Current 30-day revenue breakdown
    adminClient
      .from("revenue_records")
      .select("gross_amount_cents, platform_fee_cents, franchise_royalty_cents, net_platform_cents, event_type")
      .eq("tenant_id", tenantId)
      .gte("created_at", thirtyDaysAgo),
    // Previous 30-day period for comparison
    adminClient
      .from("revenue_records")
      .select("gross_amount_cents")
      .eq("tenant_id", tenantId)
      .gte("created_at", previousPeriodStart)
      .lt("created_at", thirtyDaysAgo),
    // Jobs operational stats
    adminClient
      .from("jobs")
      .select("id, status, created_at, final_cost_cents")
      .eq("tenant_id", tenantId)
      .gte("created_at", thirtyDaysAgo),
    // Provider counts
    adminClient
      .from("providers")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "approved"),
    // Active customers (had a job in 90 days)
    adminClient
      .from("jobs")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    // Franchise royalties
    adminClient
      .from("revenue_records")
      .select("franchise_royalty_cents")
      .eq("tenant_id", tenantId)
      .gte("created_at", thirtyDaysAgo)
      .not("franchise_royalty_cents", "is", null),
  ]);

  const revenueRows = revenueResult.data ?? [];
  const prevRevenueRows = prevRevenueResult.data ?? [];
  const jobs = jobsResult.data ?? [];

  // Revenue aggregates
  const grossRevenue30d = revenueRows.reduce((s, r) => s + (r.gross_amount_cents ?? 0), 0);
  const platformFees30d = revenueRows.reduce((s, r) => s + (r.platform_fee_cents ?? 0), 0);
  const franchiseRoyalties30d = (franchiseRoyaltyResult.data ?? []).reduce((s, r) => s + (r.franchise_royalty_cents ?? 0), 0);
  const netPlatform30d = revenueRows.reduce((s, r) => s + (r.net_platform_cents ?? 0), 0);
  const prevGross30d = prevRevenueRows.reduce((s, r) => s + (r.gross_amount_cents ?? 0), 0);
  const revenueGrowthPct = prevGross30d > 0 ? Math.round(((grossRevenue30d - prevGross30d) / prevGross30d) * 100) : 0;

  // Job stats
  const completedJobs30d = jobs.filter((j) => j.status === "completed" || j.status === "customer_confirmed");
  const activeJobs = jobs.filter((j) => ["in_progress", "accepted", "en_route", "arrived", "scheduled"].includes(j.status));
  const avgJobValue = completedJobs30d.length > 0
    ? Math.round(completedJobs30d.reduce((s, j) => s + (j.final_cost_cents ?? 0), 0) / completedJobs30d.length)
    : 0;

  // Unique active customers
  const uniqueActiveCustomers = new Set((activeCustomers.data ?? []).map((j) => j.customer_id)).size;

  // Gross margin estimate: net_platform / gross
  const grossMarginPct = grossRevenue30d > 0 ? Math.round((netPlatform30d / grossRevenue30d) * 100) : 0;

  // MRR/ARR
  const mrrCents = recurringRevenue.mrrCents;
  const arrCents = recurringRevenue.arrCents;

  // Revenue stream breakdown for display
  const streams = [
    { label: "Service Jobs (GMV)", value: grossRevenue30d, pct: 100 },
    { label: "Platform Fees", value: platformFees30d, pct: grossRevenue30d > 0 ? Math.round((platformFees30d / grossRevenue30d) * 100) : 0 },
    { label: "Membership MRR", value: mrrCents, pct: null },
    { label: "Commercial Contracts", value: execIntelligence.commercialRevenue.totalCommercialRevenueCents, pct: null },
    { label: "Franchise Royalties", value: franchiseRoyalties30d, pct: null },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="font-bold text-xl text-[#CCFF00]">⚡ Admin</Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60">Executive OS</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/intelligence" className="text-white/40 hover:text-white">Intelligence</Link>
          <Link href="/admin/mission-control" className="text-white/40 hover:text-white">Mission Control</Link>
          <Link href="/admin/command-center" className="text-white/40 hover:text-white">Command Center</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Executive Financial OS</h1>
            <p className="text-white/40 text-sm mt-1">
              30-day revenue intelligence · MRR/ARR · Operational health
            </p>
          </div>
          <Badge className={revenueGrowthPct >= 0 ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
            {revenueGrowthPct >= 0 ? "+" : ""}{revenueGrowthPct}% vs prior 30d
          </Badge>
        </div>

        {/* Primary KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "30-Day GMV", value: formatCents(grossRevenue30d), color: "text-[#CCFF00]" },
            { label: "Platform Fees", value: formatCents(platformFees30d), color: "text-white" },
            { label: "MRR", value: formatCents(mrrCents), color: "text-blue-400" },
            { label: "ARR", value: formatCents(arrCents), color: "text-violet-400" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Gross Margin", value: `${grossMarginPct}%`, color: grossMarginPct >= 20 ? "text-green-400" : "text-yellow-400" },
            { label: "Avg Job Value", value: formatCents(avgJobValue), color: "text-white" },
            { label: "Active Providers", value: (activeProviders.data?.length ?? 0).toString(), color: "text-white" },
            { label: "Active Customers (90d)", value: uniqueActiveCustomers.toString(), color: "text-white" },
          ].map((kpi) => (
            <StatCard key={kpi.label} variant="dark" label={kpi.label} value={kpi.value} valueClassName={kpi.color} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Revenue Stream Breakdown */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Revenue Streams (30-day)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {streams.map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-white/70">{s.label}</span>
                    <span className="font-semibold text-[#CCFF00]">{formatCents(s.value)}</span>
                  </div>
                  {s.pct !== null && (
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-[#CCFF00]" style={{ width: `${s.pct}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recurring Revenue Health */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Recurring Revenue Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Renewal Rate</div>
                  <div className={`font-bold text-2xl ${recurringRevenue.renewalRate >= 0.8 ? "text-green-400" : recurringRevenue.renewalRate >= 0.6 ? "text-yellow-400" : "text-red-400"}`}>
                    {Math.round(recurringRevenue.renewalRate * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Churn Rate</div>
                  <div className={`font-bold text-2xl ${recurringRevenue.churnRate <= 0.05 ? "text-green-400" : recurringRevenue.churnRate <= 0.1 ? "text-yellow-400" : "text-red-400"}`}>
                    {Math.round(recurringRevenue.churnRate * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Expansion Revenue</div>
                  <div className="font-semibold">{formatCents(recurringRevenue.expansionRevenueCents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Next Period Forecast</div>
                  <div className="font-semibold text-[#CCFF00]">{formatCents(recurringRevenue.forecastedNextPeriodRevenueCents)}</div>
                </div>
              </div>

              {recurringRevenue.planProfitability.slice(0, 3).map((p) => (
                <div key={p.planId} className="flex items-center justify-between text-xs text-white/60 py-1 border-t border-white/5">
                  <span>{p.planName}</span>
                  <span>{p.activeSubscriptions} subs · {formatCents(p.profitabilityCents)} margin</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          {/* Commercial Revenue */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">Commercial Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Realized Revenue</div>
                  <div className="font-bold text-lg text-[#CCFF00]">{formatCents(execIntelligence.commercialRevenue.totalCommercialRevenueCents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Active Contract Value</div>
                  <div className="font-bold text-lg">{formatCents(execIntelligence.commercialRevenue.activeContractValueCents)}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">At-Risk Contracts</div>
                  <div className={`font-semibold ${execIntelligence.commercialRevenue.atRiskContractCount > 0 ? "text-yellow-400" : "text-white/40"}`}>
                    {execIntelligence.commercialRevenue.atRiskContractCount}
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Renewal Pipeline</div>
                  <div className="font-semibold">{execIntelligence.commercialRevenue.renewalPipelineCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Operational Health */}
          <Card className="bg-gray-900 border-white/10 text-white">
            <CardHeader>
              <CardTitle className="text-sm">30-Day Operations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Jobs Completed</div>
                  <div className="font-bold text-2xl text-green-400">{completedJobs30d.length}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Currently Active</div>
                  <div className="font-bold text-2xl text-blue-400">{activeJobs.length}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Retention Risk</div>
                  <div className={`font-semibold ${execIntelligence.retentionRisk.atRiskMemberCount > 0 ? "text-yellow-400" : "text-white/40"}`}>
                    {execIntelligence.retentionRisk.atRiskMemberCount} at-risk members
                  </div>
                </div>
                <div>
                  <div className="text-white/40 text-xs mb-0.5">Expansion Pipeline</div>
                  <div className={`font-semibold ${execIntelligence.expansionPipeline.openOpportunityCount > 0 ? "text-[#CCFF00]" : "text-white/40"}`}>
                    {execIntelligence.expansionPipeline.openOpportunityCount} open · {formatCents(execIntelligence.expansionPipeline.openOpportunityRevenueImpactCents)}
                  </div>
                </div>
              </div>

              {franchiseRoyalties30d > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/50 flex items-center justify-between">
                  <span>Franchise royalties (30d)</span>
                  <span className="font-semibold text-[#CCFF00]">{formatCents(franchiseRoyalties30d)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick links */}
        <div className="flex gap-3 text-xs">
          <Link href="/admin/intelligence" className="text-white/40 hover:text-[#CCFF00] transition-colors">→ Predictive Intelligence</Link>
          <Link href="/admin/memberships" className="text-white/40 hover:text-[#CCFF00] transition-colors">→ Membership Plans</Link>
          <Link href="/admin/commercial" className="text-white/40 hover:text-[#CCFF00] transition-colors">→ Commercial Accounts</Link>
          <Link href="/admin/franchise" className="text-white/40 hover:text-[#CCFF00] transition-colors">→ Franchise Management</Link>
          <Link href="/admin/payouts" className="text-white/40 hover:text-[#CCFF00] transition-colors">→ Payouts</Link>
        </div>
      </div>
    </div>
  );
}
