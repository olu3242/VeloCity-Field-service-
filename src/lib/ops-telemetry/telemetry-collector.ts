/**
 * Telemetry Collector — collects and buffers operational metrics.
 * In-memory singleton with rolling cap of 5000 entries.
 */

const BUFFER_CAP = 5000

export interface TelemetryPoint {
  id: string
  metric: string
  value: number
  unit: string
  tenantId?: string
  tags: Record<string, string>
  collectedAt: string
}

const BUFFER: TelemetryPoint[] = []

function enforceCap(): void {
  while (BUFFER.length > BUFFER_CAP) BUFFER.shift()
}

export function collect(
  metric: string,
  value: number,
  unit: string,
  tags?: Record<string, string>,
  tenantId?: string
): TelemetryPoint {
  const point: TelemetryPoint = {
    id: crypto.randomUUID(),
    metric,
    value,
    unit,
    tenantId,
    tags: tags ?? {},
    collectedAt: new Date().toISOString(),
  }
  BUFFER.push(point)
  enforceCap()
  return point
}

export function getMetric(metric: string, tenantId?: string, limit = 100): TelemetryPoint[] {
  let results = BUFFER.filter((p) => p.metric === metric)
  if (tenantId !== undefined) results = results.filter((p) => p.tenantId === tenantId)
  return results.slice(-limit)
}

export function getLatestValue(metric: string, tenantId?: string): number | undefined {
  const points = getMetric(metric, tenantId, 1)
  return points[points.length - 1]?.value
}

export function getMetricStats(metric: string): {
  min: number
  max: number
  avg: number
  p95: number
  sampleCount: number
} {
  const points = BUFFER.filter((p) => p.metric === metric)
  if (points.length === 0) {
    return { min: 0, max: 0, avg: 0, p95: 0, sampleCount: 0 }
  }
  const values = points.map((p) => p.value).sort((a, b) => a - b)
  const n = values.length
  const sum = values.reduce((s, v) => s + v, 0)
  const p95Index = Math.floor(0.95 * n)
  const p95 = values[Math.min(p95Index, n - 1)] ?? 0
  return {
    min: values[0] ?? 0,
    max: values[n - 1] ?? 0,
    avg: sum / n,
    p95,
    sampleCount: n,
  }
}
