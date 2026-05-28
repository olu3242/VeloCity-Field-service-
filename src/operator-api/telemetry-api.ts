/**
 * Telemetry API — operator-facing telemetry query surface (read-only).
 */

import { logger } from "@/runtime-core/observability"
import { getOSStatus } from "@/lib/velocity-os"
import { getAllCircuits } from "@/lib/governance/circuit-breaker"

export interface TelemetrySnapshot {
  snapshotId: string
  tenantId?: string
  requestedBy: string
  correlationId: string
  metrics: {
    platformHealth: number
    activeWorkflows: number
    queueDepth: number
    circuitsBroken: number
    recentErrors: number
    uptimeSeconds: number
  }
  generatedAt: string
}

const SNAPSHOT_CACHE: TelemetrySnapshot[] = []
const SNAPSHOT_CAP = 200

let _activeWorkflows = 0
let _queueDepth = 0
let _recentErrors = 0

/** Internal counters — incremented by other subsystems if needed. */
export function incrementActiveWorkflows(delta = 1): void { _activeWorkflows = Math.max(0, _activeWorkflows + delta) }
export function incrementQueueDepth(delta = 1): void { _queueDepth = Math.max(0, _queueDepth + delta) }
export function incrementRecentErrors(delta = 1): void { _recentErrors = Math.max(0, _recentErrors + delta) }

export function generateSnapshot(
  requestedBy: string,
  tenantId?: string,
  correlationId?: string
): TelemetrySnapshot {
  const osStatus = getOSStatus()
  const circuits = getAllCircuits()
  const circuitsBroken = circuits.filter((c) => c.state === "open").length

  const snapshot: TelemetrySnapshot = {
    snapshotId: crypto.randomUUID(),
    tenantId,
    requestedBy,
    correlationId: correlationId ?? crypto.randomUUID(),
    metrics: {
      platformHealth: osStatus.healthScore,
      activeWorkflows: _activeWorkflows,
      queueDepth: _queueDepth,
      circuitsBroken,
      recentErrors: _recentErrors,
      uptimeSeconds: osStatus.uptime,
    },
    generatedAt: new Date().toISOString(),
  }

  if (SNAPSHOT_CACHE.length >= SNAPSHOT_CAP) SNAPSHOT_CACHE.shift()
  SNAPSHOT_CACHE.push(snapshot)

  logger.debug(`Telemetry snapshot generated`, "telemetry-api", {
    metadata: { snapshotId: snapshot.snapshotId, requestedBy, tenantId },
  })

  return snapshot
}

export function getLatestSnapshot(tenantId?: string): TelemetrySnapshot | undefined {
  const filtered = tenantId
    ? SNAPSHOT_CACHE.filter((s) => s.tenantId === tenantId)
    : SNAPSHOT_CACHE
  return filtered[filtered.length - 1]
}

export function getSnapshotHistory(
  tenantId?: string,
  limit = 20
): TelemetrySnapshot[] {
  const filtered = tenantId
    ? SNAPSHOT_CACHE.filter((s) => s.tenantId === tenantId)
    : SNAPSHOT_CACHE
  return filtered.slice(-limit)
}
