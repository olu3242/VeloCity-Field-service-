import { logger } from "@/runtime-core/observability"
import type { WorkflowStatus } from "./workflow-state"

export interface ExecutionRecord {
  recordId: string
  workflowId: string
  tenantId?: string
  workflowType: string
  correlationId: string
  traceId: string
  finalStatus?: WorkflowStatus
  totalSteps: number
  completedSteps: number
  totalDurationMs?: number
  checkpointCount: number
  retryCount: number
  compensationTriggered: boolean
  createdAt: string
  updatedAt: string
}

const EXECUTION_RECORDS: Map<string, ExecutionRecord> = new Map()
const RECORDS_CAP = 5000

export function createRecord(
  workflowId: string,
  workflowType: string,
  correlationId: string,
  traceId: string,
  totalSteps: number,
  tenantId?: string,
): ExecutionRecord {
  if (EXECUTION_RECORDS.size >= RECORDS_CAP) {
    const oldest = Array.from(EXECUTION_RECORDS.keys())[0]
    if (oldest !== undefined) EXECUTION_RECORDS.delete(oldest)
  }
  const now = new Date().toISOString()
  const record: ExecutionRecord = {
    recordId: crypto.randomUUID(),
    workflowId,
    tenantId,
    workflowType,
    correlationId,
    traceId,
    totalSteps,
    completedSteps: 0,
    checkpointCount: 0,
    retryCount: 0,
    compensationTriggered: false,
    createdAt: now,
    updatedAt: now,
  }
  EXECUTION_RECORDS.set(workflowId, record)
  logger.debug("Execution record created", "execution-persistence", { metadata: { workflowId, workflowType } })
  return record
}

export function updateRecord(
  workflowId: string,
  patch: Partial<Omit<ExecutionRecord, "recordId" | "workflowId">>,
): void {
  const rec = EXECUTION_RECORDS.get(workflowId)
  if (!rec) return
  Object.assign(rec, patch, { updatedAt: new Date().toISOString() })
}

export function finalizeRecord(workflowId: string, finalStatus: WorkflowStatus): void {
  const rec = EXECUTION_RECORDS.get(workflowId)
  if (!rec) return
  const now = new Date().toISOString()
  rec.finalStatus = finalStatus
  rec.updatedAt = now
  if (rec.createdAt) {
    rec.totalDurationMs = new Date(now).getTime() - new Date(rec.createdAt).getTime()
  }
  logger.info(`Execution record finalized: ${finalStatus}`, "execution-persistence", {
    metadata: { workflowId, totalDurationMs: rec.totalDurationMs },
  })
}

export function getRecord(workflowId: string): ExecutionRecord | undefined {
  return EXECUTION_RECORDS.get(workflowId)
}

export function getExecutionHistory(tenantId?: string, limit = 100): ExecutionRecord[] {
  const records = Array.from(EXECUTION_RECORDS.values())
  const filtered = tenantId !== undefined ? records.filter((r) => r.tenantId === tenantId) : records
  return filtered.slice(-Math.min(limit, filtered.length))
}

export function getPersistenceSummary(): {
  total: number
  completed: number
  failed: number
  avgDurationMs: number
  compensationRate: number
} {
  const records = Array.from(EXECUTION_RECORDS.values())
  let completed = 0
  let failed = 0
  let totalDuration = 0
  let durationCount = 0
  let compensated = 0
  for (const r of records) {
    if (r.finalStatus === "completed") completed++
    if (r.finalStatus === "failed") failed++
    if (r.totalDurationMs !== undefined) { totalDuration += r.totalDurationMs; durationCount++ }
    if (r.compensationTriggered) compensated++
  }
  const total = records.length
  return {
    total,
    completed,
    failed,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    compensationRate: total > 0 ? compensated / total : 0,
  }
}
