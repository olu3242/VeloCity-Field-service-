import { MarketplaceKPI } from "./analytics-types";

export function getCompletionRate(total: number, completed: number): number {
  if (total === 0) return 0;
  return completed / total;
}

export function computeMarketplaceKPI(
  jobs: Array<Record<string, unknown>>,
  period: string
): MarketplaceKPI {
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter((j) => j["status"] === "completed").length;
  const completionRate = getCompletionRate(totalJobs, completedJobs);

  const totalRevenueCents = jobs.reduce((sum, j) => {
    return sum + (typeof j["finalCostCents"] === "number" ? j["finalCostCents"] : 0);
  }, 0);

  const avgJobValueCents = totalJobs > 0 ? Math.floor(totalRevenueCents / totalJobs) : 0;

  const providerIds = new Set(jobs.map((j) => j["providerId"]).filter(Boolean));
  const customerIds = new Set(jobs.map((j) => j["customerId"]).filter(Boolean));

  const matchTimes = jobs
    .map((j) => (typeof j["timeToMatchMinutes"] === "number" ? j["timeToMatchMinutes"] : null))
    .filter((t): t is number => t !== null);
  const avgTimeToMatchMinutes =
    matchTimes.length > 0 ? matchTimes.reduce((a, b) => a + b, 0) / matchTimes.length : 0;

  return {
    period,
    totalJobs,
    completedJobs,
    completionRate,
    avgJobValueCents,
    totalRevenueCents,
    activeProviders: providerIds.size,
    activeCustomers: customerIds.size,
    avgTimeToMatchMinutes,
  };
}

export function compareKPIs(
  current: MarketplaceKPI,
  previous: MarketplaceKPI
): Record<string, { delta: number; pctChange: number }> {
  const fields: Array<keyof MarketplaceKPI> = [
    "totalJobs",
    "completedJobs",
    "completionRate",
    "avgJobValueCents",
    "totalRevenueCents",
    "activeProviders",
    "activeCustomers",
    "avgTimeToMatchMinutes",
  ];

  const result: Record<string, { delta: number; pctChange: number }> = {};
  for (const field of fields) {
    const curr = current[field] as number;
    const prev = previous[field] as number;
    const delta = curr - prev;
    const pctChange = prev !== 0 ? (delta / prev) * 100 : 0;
    result[field] = { delta, pctChange };
  }
  return result;
}
