export interface SyncOperation {
  id: string
  sourceRegion: string
  targetRegion: string
  dataType: "workflow_state" | "tenant_config" | "agent_registry" | "queue_metrics"
  status: "pending" | "syncing" | "synced" | "failed"
  recordCount: number
  startedAt: string
  completedAt?: string
  durationMs?: number
}

const SYNCS: SyncOperation[] = []
const SYNC_CAP = 200

export function initSync(
  sourceRegion: string,
  targetRegion: string,
  dataType: SyncOperation["dataType"],
  recordCount: number,
): SyncOperation {
  const sync: SyncOperation = {
    id: crypto.randomUUID(),
    sourceRegion,
    targetRegion,
    dataType,
    status: "pending",
    recordCount,
    startedAt: new Date().toISOString(),
  }
  SYNCS.push(sync)
  if (SYNCS.length > SYNC_CAP) SYNCS.splice(0, SYNCS.length - SYNC_CAP)
  return sync
}

export function completeSync(id: string, status: "synced" | "failed"): void {
  const sync = SYNCS.find((s) => s.id === id)
  if (!sync) return
  const completedAt = new Date().toISOString()
  const durationMs = new Date(completedAt).getTime() - new Date(sync.startedAt).getTime()
  sync.status = status
  sync.completedAt = completedAt
  sync.durationMs = durationMs
}

export function getSyncStats(sourceRegion?: string): {
  totalSyncs: number
  successRate: number
  avgDurationMs: number
} {
  const filtered = sourceRegion ? SYNCS.filter((s) => s.sourceRegion === sourceRegion) : SYNCS
  const completed = filtered.filter((s) => s.status === "synced" || s.status === "failed")
  const succeeded = filtered.filter((s) => s.status === "synced")
  const successRate = completed.length > 0 ? succeeded.length / completed.length : 0
  const withDuration = filtered.filter((s) => s.durationMs !== undefined)
  const avgDurationMs = withDuration.length > 0
    ? withDuration.reduce((s, op) => s + (op.durationMs ?? 0), 0) / withDuration.length
    : 0
  return { totalSyncs: filtered.length, successRate, avgDurationMs }
}

export function getPendingSyncs(): SyncOperation[] {
  return SYNCS.filter((s) => s.status === "pending" || s.status === "syncing")
}

export function getFailedSyncs(): SyncOperation[] {
  return SYNCS.filter((s) => s.status === "failed")
}
