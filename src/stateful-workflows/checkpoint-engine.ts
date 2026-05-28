import { logger } from "@/runtime-core/observability"
import { getWorkflowState } from "./workflow-state"
import type { WorkflowStatus } from "./workflow-state"

export interface WorkflowCheckpoint {
  checkpointId: string
  workflowId: string
  tenantId?: string
  stepIndex: number
  stepName?: string
  variables: Record<string, unknown>
  status: WorkflowStatus
  checkpointedAt: string
  version: number
  reason: "automatic" | "pre_step" | "post_step" | "on_suspend" | "manual"
}

const CHECKPOINTS: Map<string, WorkflowCheckpoint[]> = new Map()
const MAX_PER_WORKFLOW = 10

export function saveCheckpoint(
  workflowId: string,
  reason: WorkflowCheckpoint["reason"],
  tenantId?: string,
): WorkflowCheckpoint {
  const state = getWorkflowState(workflowId)
  if (!state) throw new Error(`Workflow state not found: ${workflowId}`)

  const checkpoint: WorkflowCheckpoint = {
    checkpointId: crypto.randomUUID(),
    workflowId,
    tenantId: tenantId ?? state.tenantId,
    stepIndex: state.stepIndex,
    stepName: state.currentStepName,
    variables: { ...state.variables },
    status: state.status,
    checkpointedAt: new Date().toISOString(),
    version: state.version,
    reason,
  }

  const existing = CHECKPOINTS.get(workflowId) ?? []
  existing.push(checkpoint)
  if (existing.length > MAX_PER_WORKFLOW) existing.shift()
  CHECKPOINTS.set(workflowId, existing)

  logger.debug("Checkpoint saved", "checkpoint-engine", {
    metadata: { workflowId, stepIndex: checkpoint.stepIndex, reason },
  })
  return checkpoint
}

export function getLatestCheckpoint(workflowId: string): WorkflowCheckpoint | undefined {
  const list = CHECKPOINTS.get(workflowId)
  return list?.at(-1)
}

export function getCheckpointHistory(workflowId: string): WorkflowCheckpoint[] {
  return CHECKPOINTS.get(workflowId) ?? []
}

export function pruneCheckpoints(workflowId: string, keepLast = 3): void {
  const list = CHECKPOINTS.get(workflowId)
  if (!list) return
  const pruned = list.slice(-keepLast)
  CHECKPOINTS.set(workflowId, pruned)
}

export function getCheckpointStats(): {
  totalWorkflows: number
  totalCheckpoints: number
  avgPerWorkflow: number
} {
  let total = 0
  const workflows = Array.from(CHECKPOINTS.values())
  for (const list of workflows) total += list.length
  const count = workflows.length
  return { totalWorkflows: count, totalCheckpoints: total, avgPerWorkflow: count > 0 ? total / count : 0 }
}
