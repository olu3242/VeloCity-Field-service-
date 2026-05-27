export interface ProviderMetric {
  providerId: string;
  tenantId: string;
  jobsCompleted: number;
  jobsFailed: number;
  avgRating: number;
  avgResponseMs: number;
  disputeRate: number;
  lastActiveAt: string;
  periodLabel: string;
}

export interface ProviderAnalytics {
  providerId: string;
  performanceScore: number;
  reliabilityScore: number;
  satisfactionScore: number;
  compositeScore: number;
  tier: "top" | "standard" | "at_risk" | "suspended";
}

const PROVIDER_METRICS = new Map<string, ProviderMetric[]>();
const PERIOD_CAP = 12;

export function recordProviderMetric(metric: ProviderMetric): void {
  const existing = PROVIDER_METRICS.get(metric.providerId) ?? [];
  existing.push(metric);
  if (existing.length > PERIOD_CAP) existing.shift();
  PROVIDER_METRICS.set(metric.providerId, existing);
}

export function analyzeProvider(providerId: string): ProviderAnalytics | undefined {
  const periods = PROVIDER_METRICS.get(providerId);
  if (!periods || periods.length === 0) return undefined;

  const metric = periods[periods.length - 1];
  if (!metric) return undefined;

  const totalJobs = metric.jobsCompleted + metric.jobsFailed;
  const performanceScore = totalJobs > 0
    ? (1 - metric.jobsFailed / totalJobs) * 100
    : 100;

  const reliabilityScore = Math.max(0, 100 - metric.disputeRate * 200);
  const satisfactionScore = (metric.avgRating / 5) * 100;
  const compositeScore =
    performanceScore * 0.4 + reliabilityScore * 0.35 + satisfactionScore * 0.25;

  const tier: ProviderAnalytics["tier"] =
    compositeScore >= 85 ? "top"
    : compositeScore >= 65 ? "standard"
    : compositeScore >= 40 ? "at_risk"
    : "suspended";

  return { providerId, performanceScore, reliabilityScore, satisfactionScore, compositeScore, tier };
}

export function getTopProviders(tenantId: string, limit = 10): ProviderAnalytics[] {
  const ids = Array.from(PROVIDER_METRICS.keys());
  return ids
    .filter((id) => {
      const periods = PROVIDER_METRICS.get(id) ?? [];
      return periods.some((p) => p.tenantId === tenantId);
    })
    .map((id) => analyzeProvider(id))
    .filter((a): a is ProviderAnalytics => a !== undefined)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, limit);
}

export function getAtRiskProviders(): ProviderAnalytics[] {
  const ids = Array.from(PROVIDER_METRICS.keys());
  return ids
    .map((id) => analyzeProvider(id))
    .filter((a): a is ProviderAnalytics => a !== undefined && (a.tier === "at_risk" || a.tier === "suspended"));
}
