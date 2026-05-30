import { TerritoryKPI } from "./analytics-types";

export function computeTerritoryKPI(
  territoryId: string,
  jobs: Array<Record<string, unknown>>,
  period: string
): TerritoryKPI {
  const territoryJobs = jobs.filter((j) => j["territoryId"] === territoryId);

  const jobCount = territoryJobs.length;

  const revenueCents = territoryJobs.reduce((sum, j) => {
    return sum + (typeof j["finalCostCents"] === "number" ? j["finalCostCents"] : 0);
  }, 0);

  const providerIds = new Set(
    territoryJobs.map((j) => j["providerId"]).filter(Boolean)
  );
  const customerIds = new Set(
    territoryJobs.map((j) => j["customerId"]).filter(Boolean)
  );

  const totalMarketSize =
    typeof territoryJobs[0]?.["marketSize"] === "number"
      ? (territoryJobs[0]["marketSize"] as number)
      : 0;
  const marketPenetrationRate =
    totalMarketSize > 0 ? customerIds.size / totalMarketSize : 0;

  return {
    territoryId,
    period,
    jobCount,
    revenueCents,
    providerCount: providerIds.size,
    customerCount: customerIds.size,
    marketPenetrationRate,
  };
}
