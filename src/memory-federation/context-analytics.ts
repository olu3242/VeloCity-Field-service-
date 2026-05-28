import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ContextAnalyticsSnapshot {
  snapshotId: string; tenantId?: string
  totalContexts: number; staleContexts: number; duplicatesFound: number
  conflictsDetected: number; avgFreshnessScore: number
  federationNodes: number; healthyFederationNodes: number
  capturedAt: string
}

const SNAPSHOTS: ContextAnalyticsSnapshot[] = []
const SNAPSHOTS_CAP = 300

export function captureSnapshot(tenantId?: string): ContextAnalyticsSnapshot {
  void isRuntimePaused()
  const snapshot: ContextAnalyticsSnapshot = {
    snapshotId: crypto.randomUUID(),
    ...(tenantId !== undefined ? { tenantId } : {}),
    totalContexts: 0, staleContexts: 0, duplicatesFound: 0,
    conflictsDetected: 0, avgFreshnessScore: 100,
    federationNodes: 0, healthyFederationNodes: 0,
    capturedAt: new Date().toISOString(),
  }
  SNAPSHOTS.push(snapshot)
  if (SNAPSHOTS.length > SNAPSHOTS_CAP) SNAPSHOTS.splice(0, SNAPSHOTS.length - SNAPSHOTS_CAP)
  logger.info("context-analytics", { snapshotId: snapshot.snapshotId })
  return snapshot
}

export function getLatestSnapshot(tenantId?: string): ContextAnalyticsSnapshot | undefined {
  if (tenantId === undefined) return SNAPSHOTS[SNAPSHOTS.length - 1]
  return [...SNAPSHOTS].reverse().find(s => s.tenantId === tenantId)
}

export function getSnapshotTrend(limit = 10): ContextAnalyticsSnapshot[] {
  return SNAPSHOTS.slice(-limit)
}

export function getAnalyticsSummary(): {
  snapshots: number; avgStaleRate: number; avgDuplicateRate: number
} {
  const snapshots = SNAPSHOTS.length
  const avgStaleRate = snapshots > 0
    ? SNAPSHOTS.reduce((s, snap) => {
        const rate = snap.totalContexts > 0 ? snap.staleContexts / snap.totalContexts : 0
        return s + rate
      }, 0) / snapshots
    : 0
  const avgDuplicateRate = snapshots > 0
    ? SNAPSHOTS.reduce((s, snap) => {
        const rate = snap.totalContexts > 0 ? snap.duplicatesFound / snap.totalContexts : 0
        return s + rate
      }, 0) / snapshots
    : 0
  return { snapshots, avgStaleRate, avgDuplicateRate }
}
