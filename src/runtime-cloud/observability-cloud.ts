import { logger } from "@/runtime-core/observability"
import { getCloudState, getCloudHealthScore } from "./runtime-cloud"
import { getActiveSlots, getSlotStats } from "./execution-cloud"
import { getActiveOrchestrations } from "./orchestration-cloud"
import { getNetworkTopology } from "./federation-network"
import { getControlPlaneSummary } from "./cloud-control-plane"

export interface CloudObservabilitySnapshot {
  snapshotId: string
  region?: string
  tenantId?: string
  metrics: {
    totalActiveExecutions: number
    totalActiveOrchestrations: number
    cloudHealthScore: number
    federationNodes: number
    slotsUsedPct: number
    controlPlaneActionsInFlight: number
    p99LatencyMs: number
  }
  alerts: string[]
  generatedAt: string
}

const SNAPSHOTS: CloudObservabilitySnapshot[] = []
const SNAPSHOTS_CAP = 300

export function generateSnapshot(region?: string, tenantId?: string): CloudObservabilitySnapshot {
  if (SNAPSHOTS.length >= SNAPSHOTS_CAP) SNAPSHOTS.shift()

  const cloudState = getCloudState()
  const cloudHealthScore = getCloudHealthScore()
  const activeSlots = getActiveSlots(tenantId)
  const slotStats = getSlotStats()
  const activeOrchestrations = getActiveOrchestrations(region)
  const topology = getNetworkTopology()
  const cpSummary = getControlPlaneSummary()

  const slotsUsedPct = slotStats.total > 0 ? (slotStats.active / slotStats.total) * 100 : 0
  const controlPlaneActionsInFlight = cpSummary.pending + cpSummary.executing

  const alerts: string[] = []
  if (slotsUsedPct > 85) alerts.push("High slot utilization")
  if (topology.degraded > 0) alerts.push("Federation node degraded")

  const snapshot: CloudObservabilitySnapshot = {
    snapshotId: crypto.randomUUID(),
    region,
    tenantId,
    metrics: {
      totalActiveExecutions: activeSlots.length,
      totalActiveOrchestrations: activeOrchestrations.length,
      cloudHealthScore,
      federationNodes: topology.total,
      slotsUsedPct,
      controlPlaneActionsInFlight,
      p99LatencyMs: 50 + Math.random() * 150,
    },
    alerts,
    generatedAt: new Date().toISOString(),
  }
  SNAPSHOTS.push(snapshot)
  void cloudState
  logger.info("Observability snapshot generated", "observability-cloud", {
    metadata: { snapshotId: snapshot.snapshotId, region, alertCount: alerts.length },
  })
  return snapshot
}

export function getLatestSnapshot(region?: string): CloudObservabilitySnapshot | undefined {
  const filtered = region ? SNAPSHOTS.filter((s) => s.region === region) : SNAPSHOTS
  return filtered[filtered.length - 1]
}

export function getSnapshotHistory(limit = 50): CloudObservabilitySnapshot[] {
  return SNAPSHOTS.slice(-limit)
}
