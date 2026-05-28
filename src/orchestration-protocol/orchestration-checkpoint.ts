/**
 * Orchestration Checkpoint — saves and restores execution checkpoints for replay-safe workflows.
 */

import { logger } from "@/runtime-core/observability"

export interface Checkpoint {
  checkpointId: string
  workflowId: string
  tenantId?: string
  stepIndex: number
  state: Record<string, unknown>
  checkpointedAt: string
  restoredAt?: string
  version: number
}

// Keyed by workflowId, rolling max 5 checkpoints per workflow
const CHECKPOINTS: Map<string, Checkpoint[]> = new Map()
const MAX_PER_WORKFLOW = 5

export function saveCheckpoint(
  workflowId: string,
  stepIndex: number,
  state: Record<string, unknown>,
  tenantId?: string
): Checkpoint {
  const existing = CHECKPOINTS.get(workflowId) ?? []
  const version = existing.length > 0
    ? (existing[existing.length - 1]?.version ?? 0) + 1
    : 1

  const checkpoint: Checkpoint = {
    checkpointId: crypto.randomUUID(),
    workflowId,
    tenantId,
    stepIndex,
    state,
    checkpointedAt: new Date().toISOString(),
    version,
  }

  // Rolling cap: keep last MAX_PER_WORKFLOW
  const updated = existing.length >= MAX_PER_WORKFLOW
    ? [...existing.slice(1), checkpoint]
    : [...existing, checkpoint]

  CHECKPOINTS.set(workflowId, updated)
  logger.debug(`Checkpoint saved: ${checkpoint.checkpointId}`, "orchestration-checkpoint", {
    metadata: { workflowId, stepIndex, version },
  })
  return checkpoint
}

export function getLatestCheckpoint(workflowId: string): Checkpoint | undefined {
  const list = CHECKPOINTS.get(workflowId)
  if (!list || list.length === 0) return undefined
  return list[list.length - 1]
}

export function restoreCheckpoint(checkpointId: string): Checkpoint | undefined {
  for (const list of Array.from(CHECKPOINTS.values())) {
    const found = list.find((c) => c.checkpointId === checkpointId)
    if (found) {
      found.restoredAt = new Date().toISOString()
      logger.info(`Checkpoint restored: ${checkpointId}`, "orchestration-checkpoint", {
        metadata: { workflowId: found.workflowId, stepIndex: found.stepIndex },
      })
      return found
    }
  }
  return undefined
}

export function getCheckpointCount(): number {
  let total = 0
  for (const list of Array.from(CHECKPOINTS.values())) {
    total += list.length
  }
  return total
}
