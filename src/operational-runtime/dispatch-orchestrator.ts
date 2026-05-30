import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export type DispatchOrchestrationPhase =
  | "queued" | "routing" | "assigned" | "retry" | "escalated" | "completed" | "failed"

export interface DispatchOrchestrationRecord {
  recordId: string
  jobId: string
  tenantId?: string
  phase: DispatchOrchestrationPhase
  attemptCount: number
  maxAttempts: number
  assignedProviderId?: string
  slaRemainingMs: number
  priorityScore: number
  escalated: boolean
  failureReason?: string
  lastUpdatedAt: string
  createdAt: string
}

const RECORDS: Map<string, DispatchOrchestrationRecord> = new Map()
const RECORDS_CAP = 20000

export function initiateDispatch(
  jobId: string,
  slaMs: number,
  maxAttempts = 3,
  tenantId?: string,
): DispatchOrchestrationRecord {
  if (isRuntimePaused()) {
    logger.warn("initiateDispatch blocked: runtime paused", "dispatch-orchestrator", { metadata: { jobId } })
    throw new Error("Runtime is paused")
  }
  if (RECORDS.size >= RECORDS_CAP) {
    const firstKey = Array.from(RECORDS.keys())[0]
    if (firstKey !== undefined) RECORDS.delete(firstKey)
  }
  const now = new Date().toISOString()
  const record: DispatchOrchestrationRecord = {
    recordId: crypto.randomUUID(),
    jobId, tenantId,
    phase: "queued",
    attemptCount: 0,
    maxAttempts,
    slaRemainingMs: slaMs,
    priorityScore: clampScore(100 - 0 * 10),
    escalated: false,
    lastUpdatedAt: now,
    createdAt: now,
  }
  RECORDS.set(jobId, record)
  return record
}

export function updateDispatch(jobId: string, phase: DispatchOrchestrationPhase, assignedProviderId?: string): void {
  if (isRuntimePaused()) {
    logger.warn("updateDispatch blocked: runtime paused", "dispatch-orchestrator", { metadata: { jobId } })
    return
  }
  const record = RECORDS.get(jobId)
  if (!record) return
  RECORDS.set(jobId, {
    ...record, phase,
    assignedProviderId: assignedProviderId ?? record.assignedProviderId,
    lastUpdatedAt: new Date().toISOString(),
  })
}

export function recordRetry(jobId: string): void {
  const record = RECORDS.get(jobId)
  if (!record) return
  const attemptCount = record.attemptCount + 1
  const escalated = attemptCount >= record.maxAttempts
  RECORDS.set(jobId, {
    ...record,
    attemptCount,
    phase: escalated ? "escalated" : "retry",
    escalated,
    priorityScore: clampScore(100 - attemptCount * 10),
    lastUpdatedAt: new Date().toISOString(),
  })
}

export function completeDispatch(jobId: string, success: boolean): void {
  const record = RECORDS.get(jobId)
  if (!record) return
  RECORDS.set(jobId, {
    ...record,
    phase: success ? "completed" : "failed",
    lastUpdatedAt: new Date().toISOString(),
  })
}

export function getStalledDispatches(thresholdMs = 300000): DispatchOrchestrationRecord[] {
  const cutoff = Date.now() - thresholdMs
  return Array.from(RECORDS.values()).filter(
    (r) => (r.phase === "routing" || r.phase === "assigned") && new Date(r.lastUpdatedAt).getTime() < cutoff
  )
}

export function getDispatchSummary(): {
  total: number; byPhase: Record<string, number>; escalated: number; avgAttempts: number
} {
  const all = Array.from(RECORDS.values())
  const byPhase: Record<string, number> = {}
  let totalAttempts = 0; let escalatedCount = 0
  for (const r of all) {
    byPhase[r.phase] = (byPhase[r.phase] ?? 0) + 1
    totalAttempts += r.attemptCount
    if (r.escalated) escalatedCount++
  }
  const count = all.length || 1
  return { total: all.length, byPhase, escalated: escalatedCount, avgAttempts: totalAttempts / count }
}
