import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface FederatedRollbackDecision {
  decisionId: string
  operationId: string
  participantIds: string[]
  tenantId?: string
  triggerReason: string
  rollbackScope: "single" | "partial" | "full"
  approvedBy: string
  executionPlan: string[]
  status: "pending" | "executing" | "completed" | "rejected"
  decidedAt: string
  executedAt?: string
}

const DECISIONS: FederatedRollbackDecision[] = []
const MAX_DECISIONS = 200

function pruneDecisions(): void {
  while (DECISIONS.length >= MAX_DECISIONS) {
    DECISIONS.shift()
  }
}

export function issueRollbackDecision(
  operationId: string,
  participantIds: string[],
  reason: string,
  scope: FederatedRollbackDecision["rollbackScope"],
  approvedBy: string,
  plan: string[],
  tenantId?: string
): FederatedRollbackDecision {
  if (isRuntimePaused()) {
    logger.warn("issueRollbackDecision blocked: runtime paused", { operationId })
    throw new Error("Runtime is paused")
  }

  pruneDecisions()

  const decision: FederatedRollbackDecision = {
    decisionId: crypto.randomUUID(),
    operationId,
    participantIds,
    tenantId,
    triggerReason: reason,
    rollbackScope: scope,
    approvedBy,
    executionPlan: plan,
    status: "pending",
    decidedAt: new Date().toISOString(),
  }

  DECISIONS.push(decision)
  logger.info("Rollback decision issued", { decisionId: decision.decisionId, operationId, scope })
  return decision
}

export function executeRollback(decisionId: string): void {
  const d = DECISIONS.find((x) => x.decisionId === decisionId)
  if (!d) return
  d.status = "executing"
  d.executedAt = new Date().toISOString()
  d.status = "completed"
  logger.info("Rollback executed", { decisionId })
}

export function rejectRollback(decisionId: string): void {
  const d = DECISIONS.find((x) => x.decisionId === decisionId)
  if (!d) return
  d.status = "rejected"
  logger.warn("Rollback rejected", { decisionId })
}

export function getRollbackHistory(operationId: string): FederatedRollbackDecision[] {
  return DECISIONS.filter((d) => d.operationId === operationId)
}

export function getRollbackGovernanceSummary(): {
  total: number
  completed: number
  rejected: number
  byScope: Record<string, number>
} {
  const byScope: Record<string, number> = {}
  for (const d of DECISIONS) {
    byScope[d.rollbackScope] = (byScope[d.rollbackScope] ?? 0) + 1
  }
  return {
    total: DECISIONS.length,
    completed: DECISIONS.filter((d) => d.status === "completed").length,
    rejected: DECISIONS.filter((d) => d.status === "rejected").length,
    byScope,
  }
}
