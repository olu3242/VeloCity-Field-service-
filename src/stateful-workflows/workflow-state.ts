import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type WorkflowStatus =
  | "initializing"
  | "running"
  | "suspended"
  | "awaiting_human"
  | "compensating"
  | "replaying"
  | "completing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"

export interface WorkflowStateRecord {
  stateId: string
  workflowId: string
  workflowType: string
  tenantId?: string
  correlationId: string
  status: WorkflowStatus
  stepIndex: number
  totalSteps: number
  currentStepName?: string
  variables: Record<string, unknown>
  startedAt: string
  updatedAt: string
  completedAt?: string
  suspendedAt?: string
  failureReason?: string
  retryCount: number
  version: number
}

const WORKFLOW_STATES: Map<string, WorkflowStateRecord> = new Map()
const STATE_CAP = 3000

const GATED_STATUSES = new Set<WorkflowStatus>(["suspended", "cancelled"])

export function createWorkflowState(
  workflowId: string,
  workflowType: string,
  correlationId: string,
  totalSteps: number,
  tenantId?: string,
): WorkflowStateRecord {
  if (WORKFLOW_STATES.size >= STATE_CAP) {
    const oldest = Array.from(WORKFLOW_STATES.keys())[0]
    if (oldest !== undefined) WORKFLOW_STATES.delete(oldest)
  }
  const now = new Date().toISOString()
  const record: WorkflowStateRecord = {
    stateId: crypto.randomUUID(),
    workflowId,
    workflowType,
    tenantId,
    correlationId,
    status: "initializing",
    stepIndex: 0,
    totalSteps,
    variables: {},
    startedAt: now,
    updatedAt: now,
    retryCount: 0,
    version: 1,
  }
  WORKFLOW_STATES.set(workflowId, record)
  logger.info("Workflow state created", "workflow-state", { metadata: { workflowId, workflowType } })
  return record
}

export function transitionStatus(
  workflowId: string,
  status: WorkflowStatus,
  metadata?: Record<string, unknown>,
): WorkflowStateRecord {
  if (GATED_STATUSES.has(status) && isRuntimePaused()) {
    logger.warn(`transitionStatus to ${status} blocked: runtime is paused`, "workflow-state", {
      metadata: { workflowId },
    })
    throw new Error("Runtime is paused — status transition blocked")
  }
  const rec = WORKFLOW_STATES.get(workflowId)
  if (!rec) throw new Error(`Workflow state not found: ${workflowId}`)
  const now = new Date().toISOString()
  rec.status = status
  rec.updatedAt = now
  rec.version += 1
  if (status === "suspended") rec.suspendedAt = now
  if (status === "completed" || status === "failed" || status === "cancelled") rec.completedAt = now
  if (metadata?.failureReason !== undefined && typeof metadata.failureReason === "string") {
    rec.failureReason = metadata.failureReason
  }
  return rec
}

export function updateVariables(workflowId: string, patch: Record<string, unknown>): void {
  const rec = WORKFLOW_STATES.get(workflowId)
  if (!rec) return
  rec.variables = { ...rec.variables, ...patch }
  rec.updatedAt = new Date().toISOString()
  rec.version += 1
}

export function advanceStep(workflowId: string, stepName?: string): void {
  const rec = WORKFLOW_STATES.get(workflowId)
  if (!rec) return
  rec.stepIndex += 1
  rec.currentStepName = stepName
  rec.updatedAt = new Date().toISOString()
  rec.version += 1
}

export function getWorkflowState(workflowId: string): WorkflowStateRecord | undefined {
  return WORKFLOW_STATES.get(workflowId)
}

export function getActiveWorkflows(tenantId?: string): WorkflowStateRecord[] {
  const active: WorkflowStatus[] = ["initializing", "running", "suspended", "awaiting_human", "compensating", "replaying", "completing"]
  return Array.from(WORKFLOW_STATES.values()).filter(
    (r) => active.includes(r.status) && (tenantId === undefined || r.tenantId === tenantId),
  )
}

export function getStateSummary(): {
  total: number
  byStatus: Record<string, number>
  avgRetryCount: number
} {
  const values = Array.from(WORKFLOW_STATES.values())
  const byStatus: Record<string, number> = {}
  let totalRetry = 0
  for (const r of values) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    totalRetry += r.retryCount
  }
  return { total: values.length, byStatus, avgRetryCount: values.length > 0 ? totalRetry / values.length : 0 }
}
