export interface ThroughputMetric {
  metricId: string
  subsystem: string
  tenantId?: string
  windowStartAt: string
  executionsCompleted: number
  executionsFailed: number
  avgDurationMs: number
  throughputPerMinute: number
  p95DurationMs: number
  bottleneckDetected: boolean
  bottleneckSignal?: string
}

const METRICS: ThroughputMetric[] = []
const CAP = 1000

function detectBottleneck(
  completed: number,
  failed: number,
  avgMs: number,
  p95Ms: number,
): { detected: boolean; signal?: string } {
  const highP95 = p95Ms > avgMs * 3
  const total = completed + failed
  const highFailure = total > 0 && failed / total > 0.1
  if (highP95) return { detected: true, signal: "high_p95" }
  if (highFailure) return { detected: true, signal: "high_failure_rate" }
  return { detected: false }
}

export function recordThroughput(
  subsystem: string,
  completed: number,
  failed: number,
  avgMs: number,
  p95Ms: number,
  tenantId?: string,
): ThroughputMetric {
  const { detected, signal } = detectBottleneck(completed, failed, avgMs, p95Ms)
  const metric: ThroughputMetric = {
    metricId: crypto.randomUUID(),
    subsystem,
    tenantId,
    windowStartAt: new Date().toISOString(),
    executionsCompleted: completed,
    executionsFailed: failed,
    avgDurationMs: avgMs,
    throughputPerMinute: completed,
    p95DurationMs: p95Ms,
    bottleneckDetected: detected,
    bottleneckSignal: signal,
  }
  if (METRICS.length >= CAP) METRICS.shift()
  METRICS.push(metric)
  return metric
}

export function getLatestMetric(
  subsystem: string,
  tenantId?: string,
): ThroughputMetric | undefined {
  const filtered = METRICS.filter(
    (m) => m.subsystem === subsystem && m.tenantId === tenantId,
  )
  return filtered[filtered.length - 1]
}

export function getBottlenecks(): ThroughputMetric[] {
  return METRICS.filter((m) => m.bottleneckDetected)
}

export function getThroughputSummary(): {
  total: number
  avgThroughput: number
  bottleneckCount: number
  bySubsystem: Record<string, number>
} {
  const bySubsystem: Record<string, number> = {}
  let totalThroughput = 0
  let bottleneckCount = 0
  for (const m of METRICS) {
    bySubsystem[m.subsystem] = (bySubsystem[m.subsystem] ?? 0) + 1
    totalThroughput += m.throughputPerMinute
    if (m.bottleneckDetected) bottleneckCount++
  }
  const total = METRICS.length
  return {
    total,
    avgThroughput: total > 0 ? totalThroughput / total : 0,
    bottleneckCount,
    bySubsystem,
  }
}
