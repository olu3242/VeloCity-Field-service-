import { forecastDemand, forecastProviderSupply } from "@/lib/prediction";
import { calculateTerritoryOpportunityScore } from "@/lib/expansion";
import { calculateRetentionProbabilityScore } from "@/lib/scoring";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ServiceCategory } from "@/types";

const CATEGORIES: ServiceCategory[] = ["plumbing", "electrical", "hvac", "cleaning", "handyman"];

export async function buildPredictiveMarketplaceSnapshot(tenantId: string) {
  const db = getAdminClient();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

  const [{ data: jobs }, { data: providers }, { data: serviceAreas }] = await Promise.all([
    db.from("jobs").select("id, category, status, customer_id, service_area, city, created_at").eq("tenant_id", tenantId).gte("created_at", since30d).limit(1000),
    db.from("providers").select("id, status, categories, service_area, city, is_online").eq("tenant_id", tenantId).limit(1000),
    db.from("service_areas").select("id, name").eq("tenant_id", tenantId).limit(100),
  ]);

  const jobRows = (jobs ?? []) as Array<{ category?: ServiceCategory; status?: string; customer_id?: string | null; service_area?: string | null; city?: string | null }>;
  const providerRows = (providers ?? []) as Array<{ status?: string; categories?: ServiceCategory[] | null; service_area?: string | null; city?: string | null; is_online?: boolean | null }>;
  const areas = ((serviceAreas ?? []) as Array<{ name?: string | null }>).map((area) => area.name).filter(Boolean) as string[];
  const scopes = areas.length ? areas : Array.from(new Set(jobRows.map((job) => job.service_area ?? job.city ?? "Default Market")));

  const forecasts = scopes.slice(0, 20).flatMap((serviceArea) =>
    CATEGORIES.map((category) => {
      const trailingJobs = jobRows.filter((job) => (job.service_area ?? job.city ?? "Default Market") === serviceArea && job.category === category).length;
      const activeProviders = providerRows.filter(
        (provider) =>
          provider.status === "approved" &&
          provider.is_online !== false &&
          (provider.service_area ?? provider.city ?? "Default Market") === serviceArea &&
          provider.categories?.includes(category)
      ).length;
      const demand = forecastDemand({ serviceArea, category, trailingJobs, providerCount: activeProviders });
      const supply = forecastProviderSupply({ expectedJobs: demand.expectedJobs, activeProviders });
      const opportunity = calculateTerritoryOpportunityScore({
        demandIndex: Math.min(100, demand.expectedJobs * 4),
        providerGap: supply.providersNeeded,
      });
      return { serviceArea, category, demand, supply, opportunity };
    })
  );

  const repeatCustomers = new Map<string, number>();
  jobRows.forEach((job) => {
    if (job.customer_id) repeatCustomers.set(job.customer_id, (repeatCustomers.get(job.customer_id) ?? 0) + 1);
  });
  const retention = calculateRetentionProbabilityScore({
    completedJobs: jobRows.filter((job) => job.status === "completed").length,
    daysSinceLastJob: jobRows.length ? 14 : 90,
    recurringCategory: true,
  });

  const snapshot = {
    forecastCount: forecasts.length,
    highDemand: forecasts.filter((item) => item.demand.demandLevel === "high").length,
    shortageMarkets: forecasts.filter((item) => item.supply.expectedShortage).length,
    topOpportunities: forecasts.sort((a, b) => b.opportunity.score - a.opportunity.score).slice(0, 10),
    retention,
    repeatCustomerRate: repeatCustomers.size ? Array.from(repeatCustomers.values()).filter((count) => count > 1).length / repeatCustomers.size : 0,
  };

  await db.from("intelligence_snapshots").insert({
    tenant_id: tenantId,
    scope: "marketplace_predictive",
    forecast: snapshot,
    risk: {
      shortageMarkets: snapshot.shortageMarkets,
      retentionLevel: retention.level,
    },
    recommendations: snapshot.topOpportunities.map((item) => ({
      type: "territory_supply",
      serviceArea: item.serviceArea,
      category: item.category,
      providersNeeded: item.supply.providersNeeded,
      score: item.opportunity.score,
    })),
    confidence: 0.78,
  }).then(() => null);

  return snapshot;
}
