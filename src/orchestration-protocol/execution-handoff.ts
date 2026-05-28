/**
 * Execution Handoff — manages execution handoff between orchestration nodes.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface HandoffRequest {
  handoffId: string
  workflowId: string
  correlationId: string
  fromNode: string
  toNode: string
  tenantId?: string
  stepIndex: number
  handoffState: Record<string, unknown>
  requestedAt: string
  expiresAt: string
  status: "pending" | "accepted" | "rejected" | "expired"
}

const HANDOFFS: Map<string, HandoffRequest> = new Map()
const HANDOFFS_CAP = 1000
const HANDOFF_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function requestHandoff(
  workflowId: string,
  fromNode: string,
  toNode: string,
  stepIndex: number,
  state: Record<string, unknown>,
  tenantId?: string
): HandoffRequest {
  if (isRuntimePaused()) {
    logger.warn("requestHandoff blocked — runtime paused", "execution-handoff", {
      metadata: { workflowId, fromNode, toNode },
    })
  }

  if (HANDOFFS.size >= HANDOFFS_CAP) {
    const firstKey = Array.from(HANDOFFS.keys())[0]
    if (firstKey !== undefined) HANDOFFS.delete(firstKey)
  }

  const handoff: HandoffRequest = {
    handoffId: crypto.randomUUID(),
    workflowId,
    correlationId: crypto.randomUUID(),
    fromNode,
    toNode,
    tenantId,
    stepIndex,
    handoffState: state,
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
    status: "pending",
  }
  HANDOFFS.set(handoff.handoffId, handoff)
  logger.info(`Handoff requested: ${handoff.handoffId}`, "execution-handoff", {
    metadata: { workflowId, fromNode, toNode },
  })
  return handoff
}

export function acceptHandoff(handoffId: string): HandoffRequest {
  const handoff = HANDOFFS.get(handoffId)
  if (!handoff) throw new Error(`Handoff not found: ${handoffId}`)
  if (handoff.status !== "pending") throw new Error(`Handoff not pending: ${handoff.status}`)
  handoff.status = "accepted"
  logger.info(`Handoff accepted: ${handoffId}`, "execution-handoff")
  return handoff
}

export function rejectHandoff(handoffId: string, reason?: string): HandoffRequest {
  const handoff = HANDOFFS.get(handoffId)
  if (!handoff) throw new Error(`Handoff not found: ${handoffId}`)
  handoff.status = "rejected"
  logger.warn(`Handoff rejected: ${handoffId}`, "execution-handoff", {
    metadata: { reason },
  })
  return handoff
}

export function expireStale(): HandoffRequest[] {
  const now = new Date()
  const expired: HandoffRequest[] = []
  for (const handoff of Array.from(HANDOFFS.values())) {
    if (handoff.status === "pending" && new Date(handoff.expiresAt) < now) {
      handoff.status = "expired"
      expired.push(handoff)
    }
  }
  return expired
}

export function getHandoffReport(): {
  pending: number
  accepted: number
  rejected: number
  expired: number
} {
  const all = Array.from(HANDOFFS.values())
  return {
    pending: all.filter((h) => h.status === "pending").length,
    accepted: all.filter((h) => h.status === "accepted").length,
    rejected: all.filter((h) => h.status === "rejected").length,
    expired: all.filter((h) => h.status === "expired").length,
  }
}
