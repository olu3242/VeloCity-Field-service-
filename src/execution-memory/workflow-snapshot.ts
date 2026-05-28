import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface WorkflowSnapshot {
  snapshotId: string
  workflowId: string
  tenantId?: string
  workflowType: string
  stepIndex: number
  totalSteps: number
  state: Record<string, unknown>
  snapshotReason: "scheduled" | "on_failure" | "on_completion" | "manual"
  confidenceScore: number
  createdAt: string
  version: number
}

// keyed by workflowId, max 3 snapshots per workflow (rolling)
const SNAPSHOTS = new Map<string, WorkflowSnapshot[]>()
const MAX_PER_WORKFLOW = 3

export function createSnapshot(
  workflowId: string,
  workflowType: string,
  stepIndex: number,
  totalSteps: number,
  state: Record<string, unknown>,
  reason: WorkflowSnapshot["snapshotReason"],
  tenantId?: string
): WorkflowSnapshot {
  if (isRuntimePaused()) {
    logger.warn("createSnapshot blocked — runtime paused", "workflow-snapshot", {
      metadata: { workflowId },
    })
    throw new Error("Runtime is paused")
  }
  const existing = SNAPSHOTS.get(workflowId) ?? []
  const version = existing.length > 0 ? existing[existing.length - 1].version + 1 : 1
  const snapshot: WorkflowSnapshot = {
    snapshotId: crypto.randomUUID(),
    workflowId,
    tenantId,
    workflowType,
    stepIndex,
    totalSteps,
    state,
    snapshotReason: reason,
    confidenceScore: clampScore(totalSteps > 0 ? stepIndex / totalSteps : 0),
    createdAt: new Date().toISOString(),
    version,
  }
  const updated = [...existing, snapshot]
  SNAPSHOTS.set(workflowId, updated.length > MAX_PER_WORKFLOW ? updated.slice(-MAX_PER_WORKFLOW) : updated)
  return snapshot
}

export function getLatestSnapshot(workflowId: string): WorkflowSnapshot | undefined {
  const list = SNAPSHOTS.get(workflowId)
  if (!list || list.length === 0) return undefined
  return list[list.length - 1]
}

export function getAllSnapshots(workflowId: string): WorkflowSnapshot[] {
  return SNAPSHOTS.get(workflowId) ?? []
}

export function getSnapshotCount(): number {
  return Array.from(SNAPSHOTS.values()).reduce((sum, arr) => sum + arr.length, 0)
}

export function getSnapshotSummary(): {
  totalWorkflows: number
  totalSnapshots: number
  avgConfidence: number
} {
  const allSnapshots = Array.from(SNAPSHOTS.values()).flat()
  const totalConf = allSnapshots.reduce((sum, s) => sum + s.confidenceScore, 0)
  return {
    totalWorkflows: SNAPSHOTS.size,
    totalSnapshots: allSnapshots.length,
    avgConfidence: allSnapshots.length > 0 ? totalConf / allSnapshots.length : 0,
  }
}
