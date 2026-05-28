import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import {
  createWorkflowState,
  transitionStatus,
  getWorkflowState,
  getActiveWorkflows,
} from "./workflow-state"
import { createRecord, finalizeRecord } from "./execution-persistence"
import { appendEvent } from "./temporal-history"
import { saveCheckpoint } from "./checkpoint-engine"

export interface WorkflowStartOptions {
  tenantId?: string
  correlationId?: string
  traceId?: string
  variables?: Record<string, unknown>
  priority?: "low" | "normal" | "high" | "critical"
  maxRetries?: number
}

export interface WorkflowStartResult {
  workflowId: string
  stateId: string
  recordId: string
  correlationId: string
  traceId: string
  startedAt: string
}

export function startWorkflow(
  workflowType: string,
  totalSteps: number,
  options?: WorkflowStartOptions,
): WorkflowStartResult {
  if (isRuntimePaused()) {
    logger.warn("startWorkflow blocked: runtime is paused", "workflow-runtime", {
      metadata: { workflowType },
    })
    throw new Error("Runtime is paused — workflow start blocked")
  }

  const workflowId = crypto.randomUUID()
  const correlationId = options?.correlationId ?? crypto.randomUUID()
  const traceId = options?.traceId ?? crypto.randomUUID()
  const now = new Date().toISOString()

  const state = createWorkflowState(workflowId, workflowType, correlationId, totalSteps, options?.tenantId)
  transitionStatus(workflowId, "running")
  if (options?.variables) {
    const s = getWorkflowState(workflowId)
    if (s) s.variables = { ...options.variables }
  }

  const record = createRecord(workflowId, workflowType, correlationId, traceId, totalSteps, options?.tenantId)
  appendEvent(workflowId, "workflow_started", { workflowType, correlationId, traceId, totalSteps }, {
    tenantId: options?.tenantId,
  })

  logger.info("Workflow started", "workflow-runtime", {
    metadata: { workflowId, workflowType, correlationId },
  })

  return { workflowId, stateId: state.stateId, recordId: record.recordId, correlationId, traceId, startedAt: now }
}

export function suspendWorkflow(workflowId: string, reason?: string): void {
  transitionStatus(workflowId, "suspended", reason ? { failureReason: reason } : undefined)
  saveCheckpoint(workflowId, "on_suspend")
  appendEvent(workflowId, "workflow_suspended", { reason: reason ?? "operator request" })
  logger.info("Workflow suspended", "workflow-runtime", { metadata: { workflowId, reason } })
}

export function completeWorkflow(workflowId: string): void {
  transitionStatus(workflowId, "completing")
  transitionStatus(workflowId, "completed")
  finalizeRecord(workflowId, "completed")
  appendEvent(workflowId, "workflow_completed", { completedAt: new Date().toISOString() })
  logger.info("Workflow completed", "workflow-runtime", { metadata: { workflowId } })
}

export function failWorkflow(workflowId: string, reason: string): void {
  transitionStatus(workflowId, "failed", { failureReason: reason })
  finalizeRecord(workflowId, "failed")
  appendEvent(workflowId, "workflow_failed", { reason })
  logger.error(`Workflow failed: ${reason}`, "workflow-runtime", { metadata: { workflowId } })
}

export function getWorkflowSummary(): {
  active: number
  suspended: number
  completed: number
  failed: number
  awaitingHuman: number
} {
  const all = getActiveWorkflows()
  return {
    active: all.filter((w) => w.status === "running").length,
    suspended: all.filter((w) => w.status === "suspended").length,
    completed: 0,
    failed: 0,
    awaitingHuman: all.filter((w) => w.status === "awaiting_human").length,
  }
}
