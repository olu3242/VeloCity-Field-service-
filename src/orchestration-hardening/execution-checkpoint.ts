import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type CheckpointStatus = "pending" | "saved" | "restored" | "expired"
export interface ExecutionCheckpoint {
  checkpointId: string; executionId: string; workflowType: string; tenantId?: string
  stepIndex: number; stateSnapshot: Record<string, unknown>; status: CheckpointStatus
  checkpointedAt: string; expiresAt: string; restoredAt?: string
}

const CHECKPOINTS: Map<string, ExecutionCheckpoint[]> = new Map()
const MAX_PER_EXECUTION = 10
const TOTAL_CAP = 5000

function totalCount(): number {
  return Array.from(CHECKPOINTS.values()).reduce((s, arr) => s + arr.length, 0)
}

export function createCheckpoint(
  executionId: string, workflowType: string, stepIndex: number,
  stateSnapshot: Record<string, unknown>, tenantId?: string
): ExecutionCheckpoint {
  if (isRuntimePaused()) {
    logger.warn("execution-checkpoint", { msg: "runtime paused, checkpoint blocked", executionId })
    throw new Error("Runtime is paused")
  }
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  const checkpoint: ExecutionCheckpoint = {
    checkpointId: crypto.randomUUID(), executionId, workflowType,
    ...(tenantId !== undefined ? { tenantId } : {}),
    stepIndex, stateSnapshot, status: "saved",
    checkpointedAt: now.toISOString(), expiresAt,
  }
  const existing = CHECKPOINTS.get(executionId) ?? []
  existing.push(checkpoint)
  const trimmed = existing.slice(-MAX_PER_EXECUTION)
  CHECKPOINTS.set(executionId, trimmed)
  while (totalCount() > TOTAL_CAP) {
    const firstKey = Array.from(CHECKPOINTS.keys())[0]
    if (firstKey === undefined) break
    const arr = CHECKPOINTS.get(firstKey)!
    arr.shift()
    if (arr.length === 0) CHECKPOINTS.delete(firstKey)
  }
  logger.info("execution-checkpoint", { checkpointId: checkpoint.checkpointId, executionId, stepIndex })
  return checkpoint
}

export function restoreLatestCheckpoint(executionId: string): ExecutionCheckpoint | undefined {
  const checkpoints = CHECKPOINTS.get(executionId) ?? []
  const saved = [...checkpoints].reverse().find(c => c.status === "saved")
  if (!saved) return undefined
  saved.status = "restored"
  saved.restoredAt = new Date().toISOString()
  logger.info("execution-checkpoint", { msg: "restored", checkpointId: saved.checkpointId, executionId })
  return saved
}

export function expireStale(): number {
  const now = new Date()
  let count = 0
  for (const arr of Array.from(CHECKPOINTS.values())) {
    for (const cp of arr) {
      if (cp.status === "saved" && new Date(cp.expiresAt) < now) {
        cp.status = "expired"
        count++
      }
    }
  }
  return count
}

export function getCheckpoints(executionId: string): ExecutionCheckpoint[] {
  return CHECKPOINTS.get(executionId) ?? []
}

export function getCheckpointSummary(): {
  total: number; saved: number; restored: number; expired: number; avgPerExecution: number
} {
  const all = Array.from(CHECKPOINTS.values()).flat()
  const total = all.length
  const saved = all.filter(c => c.status === "saved").length
  const restored = all.filter(c => c.status === "restored").length
  const expired = all.filter(c => c.status === "expired").length
  const execCount = CHECKPOINTS.size
  const avgPerExecution = execCount > 0 ? total / execCount : 0
  return { total, saved, restored, expired, avgPerExecution }
}
