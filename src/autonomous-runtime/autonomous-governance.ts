import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface AutonomousGovernanceAction {
  actionId: string
  triggerPrinciple: string
  tenantId?: string
  entityId: string
  violationDescription: string
  enforcementAction: string
  severity: "minor" | "moderate" | "major" | "critical"
  autonomous: boolean
  status: "enforcing" | "enforced" | "overridden" | "failed"
  triggeredAt: string
  enforcedAt?: string
}

const ACTIONS: AutonomousGovernanceAction[] = []
const MAX_ACTIONS = 500

function cap(): void {
  while (ACTIONS.length > MAX_ACTIONS) ACTIONS.shift()
}

export function enforceGovernance(
  principle: string,
  entityId: string,
  violation: string,
  action: string,
  severity: AutonomousGovernanceAction["severity"],
  tenantId?: string,
  autonomous?: boolean,
): AutonomousGovernanceAction {
  if (isRuntimePaused()) {
    logger.warn("enforceGovernance blocked: runtime paused", "autonomous-governance")
  }
  const govAction: AutonomousGovernanceAction = {
    actionId: crypto.randomUUID(),
    triggerPrinciple: principle,
    tenantId,
    entityId,
    violationDescription: violation,
    enforcementAction: action,
    severity,
    autonomous: autonomous ?? true,
    status: "enforcing",
    triggeredAt: new Date().toISOString(),
  }
  ACTIONS.push(govAction)
  cap()
  logger.warn(
    `Governance enforcement: ${principle} — ${action}`,
    "autonomous-governance",
    { metadata: { actionId: govAction.actionId, severity, entityId } },
  )
  return govAction
}

export function completeEnforcement(actionId: string): void {
  const a = ACTIONS.find((x) => x.actionId === actionId)
  if (!a) return
  a.status = "enforced"
  a.enforcedAt = new Date().toISOString()
}

export function overrideEnforcement(actionId: string): void {
  const a = ACTIONS.find((x) => x.actionId === actionId)
  if (!a) return
  a.status = "overridden"
}

export function getActiveEnforcements(
  tenantId?: string,
): AutonomousGovernanceAction[] {
  return ACTIONS.filter(
    (a) =>
      a.status === "enforcing" &&
      (tenantId === undefined || a.tenantId === tenantId),
  )
}

export function getGovernanceSummary(): {
  total: number
  autonomous: number
  overridden: number
  bySeverity: Record<string, number>
} {
  const autonomous = ACTIONS.filter((a) => a.autonomous).length
  const overridden = ACTIONS.filter((a) => a.status === "overridden").length
  const bySeverity: Record<string, number> = {}
  for (const a of ACTIONS) {
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1
  }
  return { total: ACTIONS.length, autonomous, overridden, bySeverity }
}
