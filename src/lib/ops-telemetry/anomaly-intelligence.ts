/**
 * Anomaly Intelligence — detects operational anomalies from metric deviations.
 * In-memory singleton with rolling cap of 300 entries.
 */

const ANOMALY_CAP = 300

export interface OperationalAnomaly {
  id: string
  metric: string
  tenantId?: string
  observedValue: number
  baselineValue: number
  deviationPct: number
  severity: "low" | "medium" | "high" | "critical"
  category: "performance" | "error_rate" | "latency" | "cost" | "throughput"
  detectedAt: string
  acknowledged: boolean
}

const ANOMALIES: OperationalAnomaly[] = []

function enforceCap(): void {
  while (ANOMALIES.length > ANOMALY_CAP) ANOMALIES.shift()
}

function deriveSeverity(deviationPct: number): OperationalAnomaly["severity"] {
  const abs = Math.abs(deviationPct)
  if (abs > 100) return "critical"
  if (abs > 50) return "high"
  if (abs > 30) return "medium"
  return "low"
}

export function detectAnomaly(
  metric: string,
  observed: number,
  baseline: number,
  category: OperationalAnomaly["category"],
  tenantId?: string
): OperationalAnomaly | null {
  if (baseline === 0) return null
  const deviationPct = ((observed - baseline) / Math.abs(baseline)) * 100
  if (Math.abs(deviationPct) <= 20) return null

  const anomaly: OperationalAnomaly = {
    id: crypto.randomUUID(),
    metric,
    tenantId,
    observedValue: observed,
    baselineValue: baseline,
    deviationPct,
    severity: deriveSeverity(deviationPct),
    category,
    detectedAt: new Date().toISOString(),
    acknowledged: false,
  }
  ANOMALIES.push(anomaly)
  enforceCap()
  return anomaly
}

export function acknowledgeAnomaly(id: string): void {
  const anomaly = ANOMALIES.find((a) => a.id === id)
  if (anomaly) anomaly.acknowledged = true
}

export function getActiveAnomalies(
  category?: OperationalAnomaly["category"]
): OperationalAnomaly[] {
  const active = ANOMALIES.filter((a) => !a.acknowledged)
  if (category) return active.filter((a) => a.category === category)
  return active
}

export function getAnomalySummary(): {
  total: number
  active: number
  bySeverity: Record<string, number>
} {
  const active = getActiveAnomalies()
  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  for (const a of active) {
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1
  }
  return { total: ANOMALIES.length, active: active.length, bySeverity }
}
