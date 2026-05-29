import { logger } from "@/runtime-core/observability"

export interface AggregatedMetric {
  metricId: string
  metricName: string
  subsystem: string
  tenantId?: string
  windowMinutes: number
  count: number
  sum: number
  avg: number
  min: number
  max: number
  p95: number
  aggregatedAt: string
}

const METRICS: AggregatedMetric[] = []
const MAX_METRICS = 1000

function pruneMetrics(): void {
  while (METRICS.length >= MAX_METRICS) {
    METRICS.shift()
  }
}

export function aggregate(
  metricName: string,
  subsystem: string,
  values: number[],
  windowMinutes: number,
  tenantId?: string
): AggregatedMetric {
  pruneMetrics()

  let count = 0
  let sum = 0
  let avg = 0
  let min = 0
  let max = 0
  let p95 = 0

  if (values.length > 0) {
    count = values.length
    sum = values.reduce((s, v) => s + v, 0)
    avg = sum / count
    min = Math.min(...values)
    max = Math.max(...values)
    const sorted = [...values].sort((a, b) => a - b)
    p95 = sorted[Math.floor(sorted.length * 0.95)]
  }

  const metric: AggregatedMetric = {
    metricId: crypto.randomUUID(),
    metricName,
    subsystem,
    tenantId,
    windowMinutes,
    count,
    sum,
    avg,
    min,
    max,
    p95,
    aggregatedAt: new Date().toISOString(),
  }

  METRICS.push(metric)
  logger.info("Metric aggregated", { metricName, subsystem, count })
  return metric
}

export function getMetric(metricName: string, subsystem: string): AggregatedMetric | undefined {
  for (let i = METRICS.length - 1; i >= 0; i--) {
    const m = METRICS[i]
    if (m && m.metricName === metricName && m.subsystem === subsystem) return m
  }
  return undefined
}

export function getSubsystemMetrics(subsystem: string): AggregatedMetric[] {
  return METRICS.filter((m) => m.subsystem === subsystem)
}

export function getAggregationSummary(): {
  total: number
  bySubsystem: Record<string, number>
  avgP95: number
} {
  const bySubsystem: Record<string, number> = {}
  for (const m of METRICS) {
    bySubsystem[m.subsystem] = (bySubsystem[m.subsystem] ?? 0) + 1
  }
  const avgP95 = METRICS.length > 0 ? METRICS.reduce((s, m) => s + m.p95, 0) / METRICS.length : 0
  return { total: METRICS.length, bySubsystem, avgP95 }
}
