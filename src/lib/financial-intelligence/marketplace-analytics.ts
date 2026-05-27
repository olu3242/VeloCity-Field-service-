export interface MarketplaceMetric {
  id: string
  period: string
  totalTransactions: number
  totalVolumeUsd: number
  avgTransactionUsd: number
  disputeRate: number
  chargebackRate: number
  automationSavingsUsd: number
  recordedAt: string
}

const METRICS: MarketplaceMetric[] = []
const METRICS_CAP = 24

export function recordMarketplaceMetrics(
  period: string,
  totalTransactions: number,
  totalVolumeUsd: number,
  disputeRate: number,
  chargebackRate: number,
  automationSavingsUsd: number,
): MarketplaceMetric {
  const metric: MarketplaceMetric = {
    id: crypto.randomUUID(),
    period,
    totalTransactions,
    totalVolumeUsd,
    avgTransactionUsd: totalTransactions > 0 ? totalVolumeUsd / totalTransactions : 0,
    disputeRate,
    chargebackRate,
    automationSavingsUsd,
    recordedAt: new Date().toISOString(),
  }
  METRICS.push(metric)
  if (METRICS.length > METRICS_CAP) METRICS.splice(0, METRICS.length - METRICS_CAP)
  return metric
}

export function getLatestMetrics(): MarketplaceMetric | undefined {
  return METRICS[METRICS.length - 1]
}

export function getMetricsHistory(limit?: number): MarketplaceMetric[] {
  return limit !== undefined ? METRICS.slice(-limit) : [...METRICS]
}

export function getAutomationROI(): {
  totalSavings: number
  avgSavingsPerPeriod: number
  peakSavingsPeriod: string | undefined
} {
  const totalSavings = METRICS.reduce((s, m) => s + m.automationSavingsUsd, 0)
  const avgSavingsPerPeriod = METRICS.length > 0 ? totalSavings / METRICS.length : 0
  const peak = METRICS.reduce<MarketplaceMetric | undefined>(
    (best, m) => (best === undefined || m.automationSavingsUsd > best.automationSavingsUsd ? m : best),
    undefined,
  )
  return { totalSavings, avgSavingsPerPeriod, peakSavingsPeriod: peak?.period }
}
