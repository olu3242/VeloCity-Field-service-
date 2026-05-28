import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { getPlan } from "./deployment-plan"

export interface RollbackRecord {
  rollbackId: string
  planId: string
  tenantId?: string
  trigger: "automatic" | "manual" | "threshold_breach" | "operator"
  triggerReason: string
  fromVersion: string
  toVersion: string
  status: "initiated" | "in_progress" | "completed" | "failed"
  initiatedAt: string
  completedAt?: string
  durationMs?: number
}

const ROLLBACKS: RollbackRecord[] = []
const ROLLBACKS_CAP = 200

export function initiateRollback(
  planId: string,
  fromVersion: string,
  toVersion: string,
  trigger: RollbackRecord["trigger"],
  reason: string,
  tenantId?: string
): RollbackRecord {
  if (isRuntimePaused()) {
    throw new Error("Runtime is paused — cannot initiate rollback")
  }
  if (ROLLBACKS.length >= ROLLBACKS_CAP) ROLLBACKS.shift()

  const record: RollbackRecord = {
    rollbackId: crypto.randomUUID(),
    planId,
    tenantId,
    trigger,
    triggerReason: reason,
    fromVersion,
    toVersion,
    status: "initiated",
    initiatedAt: new Date().toISOString(),
  }
  ROLLBACKS.push(record)
  logger.warn(`Rollback initiated for plan ${planId}`, "rollback-orchestrator", {
    metadata: { trigger, fromVersion, toVersion },
  })
  return record
}

function findRollback(rollbackId: string): RollbackRecord | undefined {
  return ROLLBACKS.find((r) => r.rollbackId === rollbackId)
}

export function progressRollback(rollbackId: string): void {
  const record = findRollback(rollbackId)
  if (!record) throw new Error(`Rollback not found: ${rollbackId}`)
  record.status = "in_progress"
}

export function completeRollback(rollbackId: string): void {
  const record = findRollback(rollbackId)
  if (!record) throw new Error(`Rollback not found: ${rollbackId}`)
  record.status = "completed"
  record.completedAt = new Date().toISOString()
  record.durationMs = new Date(record.completedAt).getTime() - new Date(record.initiatedAt).getTime()
}

export function failRollback(rollbackId: string): void {
  const record = findRollback(rollbackId)
  if (!record) throw new Error(`Rollback not found: ${rollbackId}`)
  record.status = "failed"
  record.completedAt = new Date().toISOString()
}

export function checkAutoRollbackThreshold(planId: string, errorRate: number): boolean {
  const plan = getPlan(planId)
  if (!plan) return false
  return errorRate >= plan.rollbackTriggerThreshold
}

export function getRollbackHistory(planId: string): RollbackRecord[] {
  return ROLLBACKS.filter((r) => r.planId === planId)
}

export function getRollbackSummary(): {
  total: number
  byTrigger: Record<string, number>
  avgDurationMs: number
} {
  const byTrigger: Record<string, number> = {}
  let totalDuration = 0
  let durationCount = 0
  for (const r of ROLLBACKS) {
    byTrigger[r.trigger] = (byTrigger[r.trigger] ?? 0) + 1
    if (r.durationMs !== undefined) {
      totalDuration += r.durationMs
      durationCount++
    }
  }
  const avgDurationMs = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0
  return { total: ROLLBACKS.length, byTrigger, avgDurationMs }
}
