import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface ThroughputWindow {
  windowId: string
  graphId: string
  tenantId?: string
  windowStartAt: string
  windowDurationMs: number
  nodesProcessed: number
  edgesTraversed: number
  executionsCompleted: number
  throughputNodesPerSec: number
  throughputExecPerMin: number
  saturationPct: number
  recordedAt: string
}

const WINDOWS: ThroughputWindow[] = []
const ROLLING_CAP = 1000

export function recordThroughputWindow(
  graphId: string,
  windowDurationMs: number,
  nodesProcessed: number,
  edgesTraversed: number,
  executionsCompleted: number,
  tenantId?: string
): ThroughputWindow {
  if (isRuntimePaused()) {
    logger.warn("recordThroughputWindow blocked: runtime paused", { graphId })
  }
  const throughputNodesPerSec =
    nodesProcessed / Math.max(1, windowDurationMs / 1000)
  const throughputExecPerMin =
    executionsCompleted / Math.max(1, windowDurationMs / 60000)
  const saturationPct = clampScore(
    (nodesProcessed / Math.max(1, edgesTraversed)) * 50
  )
  const now = new Date().toISOString()
  const record: ThroughputWindow = {
    windowId: crypto.randomUUID(),
    graphId,
    tenantId,
    windowStartAt: now,
    windowDurationMs,
    nodesProcessed,
    edgesTraversed,
    executionsCompleted,
    throughputNodesPerSec,
    throughputExecPerMin,
    saturationPct,
    recordedAt: now,
  }
  WINDOWS.push(record)
  if (WINDOWS.length > ROLLING_CAP) WINDOWS.shift()
  return record
}

export function getLatestWindow(graphId: string): ThroughputWindow | undefined {
  for (let i = WINDOWS.length - 1; i >= 0; i--) {
    if (WINDOWS[i].graphId === graphId) return WINDOWS[i]
  }
  return undefined
}

export function getSaturatedGraphs(): ThroughputWindow[] {
  return WINDOWS.filter((w) => w.saturationPct >= 85)
}

export function getThroughputSummary(): {
  total: number
  avgNodesPerSec: number
  avgExecPerMin: number
  saturatedCount: number
} {
  const total = WINDOWS.length
  const avgNodesPerSec =
    total > 0
      ? WINDOWS.reduce((s, w) => s + w.throughputNodesPerSec, 0) / total
      : 0
  const avgExecPerMin =
    total > 0
      ? WINDOWS.reduce((s, w) => s + w.throughputExecPerMin, 0) / total
      : 0
  const saturatedCount = WINDOWS.filter((w) => w.saturationPct >= 85).length
  return { total, avgNodesPerSec, avgExecPerMin, saturatedCount }
}
