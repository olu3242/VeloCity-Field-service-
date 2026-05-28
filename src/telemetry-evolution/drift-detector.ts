import { logger } from "@/runtime-core/observability"

export interface DriftDetection {
  detectionId: string
  metricName: string
  subsystem: string
  tenantId?: string
  baselineValue: number
  currentValue: number
  driftPct: number
  driftDetected: boolean
  driftDirection: "up" | "down" | "stable"
  threshold: number
  detectedAt: string
}

const DETECTIONS: DriftDetection[] = []
const MAX_DETECTIONS = 500
const BASELINES = new Map<string, number>()
const MAX_BASELINES = 500

export function setBaseline(subsystem: string, metricName: string, value: number): void {
  const key = `${subsystem}:${metricName}`
  if (BASELINES.size >= MAX_BASELINES && !BASELINES.has(key)) {
    const oldest = Array.from(BASELINES.keys())[0]
    BASELINES.delete(oldest)
  }
  BASELINES.set(key, value)
}

export function detectDrift(
  subsystem: string,
  metricName: string,
  currentValue: number,
  threshold = 20,
  tenantId?: string
): DriftDetection {
  while (DETECTIONS.length >= MAX_DETECTIONS) {
    DETECTIONS.shift()
  }

  const key = `${subsystem}:${metricName}`
  const baseline = BASELINES.get(key) ?? 0
  const driftPct = baseline > 0 ? Math.abs(((currentValue - baseline) / baseline) * 100) : 0
  const driftDetected = driftPct > threshold
  const driftDirection: DriftDetection["driftDirection"] =
    currentValue > baseline ? "up" : currentValue < baseline ? "down" : "stable"

  const detection: DriftDetection = {
    detectionId: crypto.randomUUID(),
    metricName,
    subsystem,
    tenantId,
    baselineValue: baseline,
    currentValue,
    driftPct,
    driftDetected,
    driftDirection,
    threshold,
    detectedAt: new Date().toISOString(),
  }

  DETECTIONS.push(detection)
  if (driftDetected) {
    logger.warn("Drift detected", { subsystem, metricName, driftPct, driftDirection })
  }
  return detection
}

export function getDriftingMetrics(subsystem?: string): DriftDetection[] {
  return DETECTIONS.filter(
    (d) => d.driftDetected && (subsystem === undefined || d.subsystem === subsystem)
  )
}

export function getDriftSummary(): {
  total: number
  drifting: number
  driftRate: number
  byDirection: Record<string, number>
} {
  const total = DETECTIONS.length
  const drifting = DETECTIONS.filter((d) => d.driftDetected).length
  const driftRate = total > 0 ? drifting / total : 0
  const byDirection: Record<string, number> = {}
  for (const d of DETECTIONS) {
    byDirection[d.driftDirection] = (byDirection[d.driftDirection] ?? 0) + 1
  }
  return { total, drifting, driftRate, byDirection }
}
