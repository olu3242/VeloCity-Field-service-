// Provider Growth Intelligence — read-time computation over existing
// jobs/payments/provider data (Rule 1: no new write paths, no new agent
// framework). Mirrors the existing analyzeSupplyGap/territory-opportunity
// read-time pattern in src/lib/expansion. Surfaced in Command Center and
// the Provider Dashboard. Every opportunity is derived from real job/
// revenue/demand history (Rule 2) and is actionable (Rule 3).

import { getAdminClient } from "@/lib/supabase/admin";
import { lena } from "@/lib/agents/lena";

export interface RevenueOpportunity {
  category: string;
  currentMonthlyRevenueCents: number;
  priorMonthlyRevenueCents: number;
  trend: "growing" | "declining" | "flat";
}

export interface PricingOpportunity {
  category: string;
  providerAverageJobCents: number;
  platformAverageJobCents: number;
  variancePercent: number;
  reason: string;
}

export interface GeographicExpansionOpportunity {
  zip: string;
  demandJobsLast90Days: number;
  reason: string;
}

export interface ProviderGrowthReport {
  providerId: string;
  revenueOpportunities: RevenueOpportunity[];
  pricingOpportunities: PricingOpportunity[];
  serviceExpansionOpportunities: Array<{ category: string; demandJobsLast90Days: number; reason: string }>;
  geographicExpansionOpportunities: GeographicExpansionOpportunity[];
  expectedRevenueImpactCents: number;
}

export async function computeProviderGrowthIntelligence(providerId: string): Promise<ProviderGrowthReport> {
  const db = getAdminClient();

  const { data: provider } = await db
    .from("providers")
    .select("categories, service_area_ids")
    .eq("id", providerId)
    .single();

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const oneTwentyDaysAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentJobs } = await db
    .from("jobs")
    .select("category, final_cost_cents, created_at, zip")
    .eq("provider_id", providerId)
    .in("status", ["completed", "customer_confirmed"])
    .gte("created_at", oneTwentyDaysAgo);

  const jobs = recentJobs ?? [];
  const currentPeriod = jobs.filter((j: { created_at: string }) => j.created_at >= sixtyDaysAgo);
  const priorPeriod = jobs.filter((j: { created_at: string }) => j.created_at < sixtyDaysAgo);

  const sumByCategory = (rows: typeof jobs) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.category, (map.get(row.category) ?? 0) + (row.final_cost_cents ?? 0));
    }
    return map;
  };
  const currentByCategory = sumByCategory(currentPeriod);
  const priorByCategory = sumByCategory(priorPeriod);
  const categories = new Set([...Array.from(currentByCategory.keys()), ...Array.from(priorByCategory.keys())]);

  const revenueOpportunities: RevenueOpportunity[] = Array.from(categories).map((category) => {
    const current = currentByCategory.get(category) ?? 0;
    const prior = priorByCategory.get(category) ?? 0;
    const trend = current > prior * 1.1 ? "growing" : current < prior * 0.9 ? "declining" : "flat";
    return { category, currentMonthlyRevenueCents: current, priorMonthlyRevenueCents: prior, trend };
  });

  const pricingOpportunities: PricingOpportunity[] = [];
  for (const category of provider?.categories ?? []) {
    const providerJobs = jobs.filter((j: { category: string }) => j.category === category);
    if (!providerJobs.length) continue;
    const providerAvg =
      providerJobs.reduce((sum: number, j: { final_cost_cents: number | null }) => sum + (j.final_cost_cents ?? 0), 0) /
      providerJobs.length;

    const { data: platformJobs } = await db
      .from("jobs")
      .select("final_cost_cents")
      .eq("category", category)
      .in("status", ["completed", "customer_confirmed"])
      .gte("created_at", oneTwentyDaysAgo);
    const platformRows = (platformJobs ?? []).filter((j: { final_cost_cents: number | null }) => j.final_cost_cents);
    if (!platformRows.length) continue;
    const platformAvg =
      platformRows.reduce((sum: number, j: { final_cost_cents: number | null }) => sum + (j.final_cost_cents ?? 0), 0) /
      platformRows.length;

    const variancePercent = platformAvg > 0 ? Math.round(((providerAvg - platformAvg) / platformAvg) * 1000) / 10 : 0;
    if (Math.abs(variancePercent) >= 10) {
      pricingOpportunities.push({
        category,
        providerAverageJobCents: Math.round(providerAvg),
        platformAverageJobCents: Math.round(platformAvg),
        variancePercent,
        reason:
          variancePercent < 0
            ? `Provider is pricing ${Math.abs(variancePercent)}% below the platform average for ${category} — room to raise rates`
            : `Provider is pricing ${variancePercent}% above the platform average for ${category} — verify this is justified by certification tier`,
      });
    }
  }

  const growthPath = await lena.recommendGrowthPath(providerId);
  const serviceExpansionOpportunities = growthPath.service_expansion_path.map((row) => ({
    category: row.category,
    demandJobsLast90Days: row.demand_jobs_last_90_days,
    reason: row.reason,
  }));

  const providerServiceAreaIds: string[] = provider?.service_area_ids ?? [];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: demandJobs } = await db
    .from("jobs")
    .select("zip")
    .in("category", provider?.categories ?? [])
    .gte("created_at", ninetyDaysAgo)
    .not("zip", "is", null);

  const demandByZip = new Map<string, number>();
  for (const row of demandJobs ?? []) {
    if (row.zip) demandByZip.set(row.zip, (demandByZip.get(row.zip) ?? 0) + 1);
  }

  const geographicExpansionOpportunities: GeographicExpansionOpportunity[] = Array.from(demandByZip.entries())
    .filter(([zip]) => !providerServiceAreaIds.includes(zip))
    .map(([zip, count]) => ({
      zip,
      demandJobsLast90Days: count,
      reason: `${count} job(s) in this provider's categories requested in zip ${zip} over the last 90 days, outside the provider's current service area`,
    }))
    .sort((a, b) => b.demandJobsLast90Days - a.demandJobsLast90Days)
    .slice(0, 10);

  const pricingImpactCents = pricingOpportunities
    .filter((p) => p.variancePercent < 0)
    .reduce((sum, p) => sum + (p.platformAverageJobCents - p.providerAverageJobCents), 0);

  // Service-expansion impact: each missed-demand job valued at the platform's
  // actual average job price for that category (real data, not a constant).
  let expansionImpactCents = 0;
  for (const opportunity of serviceExpansionOpportunities) {
    const { data: categoryJobs } = await db
      .from("jobs")
      .select("final_cost_cents")
      .eq("category", opportunity.category)
      .in("status", ["completed", "customer_confirmed"])
      .gte("created_at", oneTwentyDaysAgo)
      .not("final_cost_cents", "is", null);
    if (categoryJobs?.length) {
      const avg =
        categoryJobs.reduce((sum: number, j: { final_cost_cents: number | null }) => sum + (j.final_cost_cents ?? 0), 0) /
        categoryJobs.length;
      expansionImpactCents += Math.round(avg * opportunity.demandJobsLast90Days);
    }
  }

  const expectedRevenueImpactCents = pricingImpactCents + expansionImpactCents;

  return {
    providerId,
    revenueOpportunities,
    pricingOpportunities,
    serviceExpansionOpportunities,
    geographicExpansionOpportunities,
    expectedRevenueImpactCents,
  };
}
