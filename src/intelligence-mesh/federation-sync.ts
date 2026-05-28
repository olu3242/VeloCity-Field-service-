import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface SyncRecord {
  syncId: string
  syncType: "full" | "incremental" | "emergency"
  sourceNodeId: string
  targetNodeId: string
  itemsSynced: number
  itemsFailed: number
  durationMs: number
  status: "pending" | "in_progress" | "completed" | "failed"
  startedAt: string
  completedAt?: string
}

const SYNC_LOG: SyncRecord[] = []
const MAX_SYNC_LOG = 500

export function initSync(
  syncType: "full" | "incremental" | "emergency",
  sourceNodeId: string,
  targetNodeId: string,
): SyncRecord {
  if (isRuntimePaused()) {
    logger.warn("initSync blocked: runtime paused", "federation-sync")
    throw new Error("Runtime is paused")
  }

  const record: SyncRecord = {
    syncId: crypto.randomUUID(),
    syncType,
    sourceNodeId,
    targetNodeId,
    itemsSynced: 0,
    itemsFailed: 0,
    durationMs: 0,
    status: "pending",
    startedAt: new Date().toISOString(),
  }

  if (SYNC_LOG.length >= MAX_SYNC_LOG) SYNC_LOG.shift()
  SYNC_LOG.push(record)
  logger.info(`Sync initiated: ${syncType} ${sourceNodeId} → ${targetNodeId}`, "federation-sync", {
    metadata: { syncId: record.syncId },
  })
  return record
}

export function progressSync(syncId: string, itemsSynced: number, itemsFailed = 0): void {
  const record = SYNC_LOG.find((s) => s.syncId === syncId)
  if (record) {
    record.status = "in_progress"
    record.itemsSynced += itemsSynced
    record.itemsFailed += itemsFailed
  }
}

export function completeSync(syncId: string, durationMs: number): void {
  const record = SYNC_LOG.find((s) => s.syncId === syncId)
  if (record) {
    record.status = "completed"
    record.durationMs = durationMs
    record.completedAt = new Date().toISOString()
    logger.info(`Sync completed: ${syncId}`, "federation-sync", { metadata: { durationMs } })
  }
}

export function failSync(syncId: string): void {
  const record = SYNC_LOG.find((s) => s.syncId === syncId)
  if (record) {
    record.status = "failed"
    record.completedAt = new Date().toISOString()
    logger.error(`Sync failed: ${syncId}`, "federation-sync")
  }
}

export function getActiveSyncs(): SyncRecord[] {
  return SYNC_LOG.filter((s) => s.status === "pending" || s.status === "in_progress")
}

export function getSyncStats(): {
  total: number
  completed: number
  failed: number
  avgItemsSynced: number
  avgDurationMs: number
} {
  const total = SYNC_LOG.length
  let completed = 0, failed = 0, totalItems = 0, totalDuration = 0
  for (const s of SYNC_LOG) {
    if (s.status === "completed") { completed++; totalDuration += s.durationMs }
    else if (s.status === "failed") failed++
    totalItems += s.itemsSynced
  }
  return {
    total,
    completed,
    failed,
    avgItemsSynced: total > 0 ? totalItems / total : 0,
    avgDurationMs: completed > 0 ? totalDuration / completed : 0,
  }
}
