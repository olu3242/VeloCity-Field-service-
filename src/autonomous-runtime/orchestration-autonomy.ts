import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface AutonomousOrchestrationDecision {
  decisionId: string
  workflowId?: string
  workflowType: string
  tenantId?: string
  decisionType:
    | "reroute"
    | "retry_policy_change"
    | "timeout_extend"
    | "step_skip"
    | "checkpoint_force"
  reasoning: string
  confidence: number
  previousConfig?: Record<string, unknown>
  newConfig: Record<string, unknown>
  status: "applied" | "reverted" | "pending" | "failed"
  appliedAt: string
  revertedAt?: string
}

const DECISIONS: AutonomousOrchestrationDecision[] = []
const MAX_DECISIONS = 500

function cap(): void {
  while (DECISIONS.length > MAX_DECISIONS) DECISIONS.shift()
}

export function makeOrchestrationDecision(
  workflowType: string,
  decisionType: AutonomousOrchestrationDecision["decisionType"],
  newConfig: Record<string, unknown>,
  reasoning: string,
  confidence: number,
  tenantId?: string,
  workflowId?: string,
): AutonomousOrchestrationDecision {
  if (isRuntimePaused()) {
    logger.warn(
      "makeOrchestrationDecision blocked: runtime paused",
      "orchestration-autonomy",
    )
  }
  const decision: AutonomousOrchestrationDecision = {
    decisionId: crypto.randomUUID(),
    workflowId,
    workflowType,
    tenantId,
    decisionType,
    reasoning,
    confidence,
    newConfig,
    status: "applied",
    appliedAt: new Date().toISOString(),
  }
  DECISIONS.push(decision)
  cap()
  logger.info(
    `Orchestration decision: ${decisionType} for ${workflowType}`,
    "orchestration-autonomy",
    { metadata: { decisionId: decision.decisionId, confidence } },
  )
  return decision
}

export function revertDecision(decisionId: string): void {
  const d = DECISIONS.find((x) => x.decisionId === decisionId)
  if (!d) return
  d.status = "reverted"
  d.revertedAt = new Date().toISOString()
}

export function getDecisionsByWorkflow(
  workflowId: string,
): AutonomousOrchestrationDecision[] {
  return DECISIONS.filter((d) => d.workflowId === workflowId)
}

export function getDecisionSummary(): {
  total: number
  byType: Record<string, number>
  byStatus: Record<string, number>
  avgConfidence: number
} {
  const byType: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let totalConfidence = 0

  for (const d of DECISIONS) {
    byType[d.decisionType] = (byType[d.decisionType] ?? 0) + 1
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1
    totalConfidence += d.confidence
  }

  return {
    total: DECISIONS.length,
    byType,
    byStatus,
    avgConfidence: DECISIONS.length > 0 ? totalConfidence / DECISIONS.length : 0,
  }
}
