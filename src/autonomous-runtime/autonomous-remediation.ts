import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { type AutonomyMode } from "./autonomous-runtime"
import { checkBoundary, recordExecution } from "./runtime-autonomy"
import { type AutonomyAction } from "./autonomous-runtime"

export interface RemediationDecision {
  decisionId: string
  incidentSignal: string
  tenantId?: string
  subsystem?: string
  autonomyMode: AutonomyMode
  selectedAction: string
  actionMagnitude: number
  confidence: number
  approved: boolean
  rollbackPlan: string
  status: "decided" | "executing" | "completed" | "rolled_back" | "failed"
  decidedAt: string
  executedAt?: string
}

const DECISIONS: RemediationDecision[] = []
const MAX_DECISIONS = 500

function cap(): void {
  while (DECISIONS.length > MAX_DECISIONS) DECISIONS.shift()
}

function inferAction(signal: string): AutonomyAction {
  const s = signal.toLowerCase()
  if (s.includes("rollback") || s.includes("revert")) return "rollback"
  if (s.includes("scale") || s.includes("capacity")) return "scale"
  if (s.includes("rebalance") || s.includes("balance")) return "rebalance"
  if (s.includes("escalate") || s.includes("critical")) return "escalate"
  if (s.includes("optim")) return "optimize"
  return "remediate"
}

export function decide(
  signal: string,
  subsystem?: string,
  tenantId?: string,
): RemediationDecision {
  if (isRuntimePaused()) {
    logger.warn("decide blocked: runtime paused", "autonomous-remediation")
  }
  const selectedAction = inferAction(signal)
  const magnitude = 30 + Math.floor(Math.random() * 41)
  const confidence = Math.random() * 0.4 + 0.6
  const boundaryCheck = checkBoundary(selectedAction, magnitude)
  const approved = boundaryCheck.allowed && !boundaryCheck.requiresApproval

  const decision: RemediationDecision = {
    decisionId: crypto.randomUUID(),
    incidentSignal: signal,
    tenantId,
    subsystem,
    autonomyMode: "supervised",
    selectedAction,
    actionMagnitude: magnitude,
    confidence,
    approved,
    rollbackPlan: `Revert ${selectedAction} if error rate increases`,
    status: "decided",
    decidedAt: new Date().toISOString(),
  }
  DECISIONS.push(decision)
  cap()
  logger.info(`Remediation decided: ${selectedAction}`, "autonomous-remediation", {
    metadata: { decisionId: decision.decisionId, approved, magnitude },
  })
  return decision
}

export function executeDecision(decisionId: string): void {
  const d = DECISIONS.find((x) => x.decisionId === decisionId)
  if (!d) return
  d.status = "executing"
  d.executedAt = new Date().toISOString()
  recordExecution(d.selectedAction as AutonomyAction)
}

export function completeDecision(decisionId: string): void {
  const d = DECISIONS.find((x) => x.decisionId === decisionId)
  if (!d) return
  d.status = "completed"
}

export function rollbackDecision(decisionId: string): void {
  const d = DECISIONS.find((x) => x.decisionId === decisionId)
  if (!d) return
  d.status = "rolled_back"
}

export function getOpenDecisions(tenantId?: string): RemediationDecision[] {
  const open = ["decided", "executing"]
  return DECISIONS.filter(
    (d) =>
      open.includes(d.status) &&
      (tenantId === undefined || d.tenantId === tenantId),
  )
}

export function getDecisionStats(): {
  total: number
  approved: number
  approved_auto: number
  rolled_back: number
  avgConfidence: number
} {
  const approved = DECISIONS.filter((d) => d.approved).length
  const rolled_back = DECISIONS.filter((d) => d.status === "rolled_back").length
  const approved_auto = DECISIONS.filter(
    (d) => d.approved && d.autonomyMode === "autonomous",
  ).length
  const avgConfidence =
    DECISIONS.length > 0
      ? DECISIONS.reduce((s, d) => s + d.confidence, 0) / DECISIONS.length
      : 0
  return { total: DECISIONS.length, approved, approved_auto, rolled_back, avgConfidence }
}
