export interface RevenueMetric {
  period: string
  mrr: number
  commissions: number
  platformFees: number
  totalRevenue: number
  tenantCount: number
  arpu: number
  recordedAt: string
}

const METRICS: RevenueMetric[] = []
const METRICS_CAP = 24

export function recordRevenuePeriod(
  period: string,
  mrr: number,
  commissions: number,
  platformFees: number,
  tenantCount: number,
): RevenueMetric {
  const totalRevenue = mrr + commissions + platformFees
  const arpu = tenantCount > 0 ? totalRevenue / tenantCount : 0
  const metric: RevenueMetric = {
    period,
    mrr,
    commissions,
    platformFees,
    totalRevenue,
    tenantCount,
    arpu,
    recordedAt: new Date().toISOString(),
  }
  METRICS.push(metric)
  if (METRICS.length > METRICS_CAP) METRICS.splice(0, METRICS.length - METRICS_CAP)
  return metric
}

export function getRevenueTrend(): "growing" | "stable" | "declining" {
  if (METRICS.length < 6) return "stable"
  const last3 = METRICS.slice(-3).reduce((s, m) => s + m.totalRevenue, 0) / 3
  const prior3 = METRICS.slice(-6, -3).reduce((s, m) => s + m.totalRevenue, 0) / 3
  if (prior3 === 0) return "stable"
  const change = (last3 - prior3) / prior3
  if (change > 0.05) return "growing"
  if (change < -0.05) return "declining"
  return "stable"
}

export function getRevenueHistory(limit?: number): RevenueMetric[] {
  return limit !== undefined ? METRICS.slice(-limit) : [...METRICS]
}

export function getLatestRevenue(): RevenueMetric | undefined {
  return METRICS[METRICS.length - 1]
}
