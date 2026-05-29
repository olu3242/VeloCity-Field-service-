import { isRuntimePaused } from "@/lib/governance/operator"

export interface AutonomousActionVerification {
  verificationId: string
  actionId: string
  actionType: string
  tenantId?: string
  magnitudeWithinBounds: boolean
  governanceApproved: boolean
  rollbackPlanPresent: boolean
  impactScopeAcceptable: boolean
  safeToExecute: boolean
  issues: string[]
  verifiedAt: string
}

const VERIFICATIONS: AutonomousActionVerification[] = []
const VERIFICATIONS_CAP = 1000

export function verifyAutonomousAction(
  actionId: string,
  actionType: string,
  magnitude: number,
  hasRollbackPlan: boolean,
  impactScope: "low" | "medium" | "high" | "critical",
  tenantId?: string
): AutonomousActionVerification {
  if (VERIFICATIONS.length >= VERIFICATIONS_CAP) VERIFICATIONS.shift()

  const magnitudeWithinBounds = magnitude <= 80
  const governanceApproved = !isRuntimePaused()
  const rollbackPlanPresent = hasRollbackPlan
  const impactScopeAcceptable = impactScope !== "critical"
  const safeToExecute =
    magnitudeWithinBounds && governanceApproved && rollbackPlanPresent && impactScopeAcceptable

  const issues: string[] = []
  if (!magnitudeWithinBounds) issues.push("magnitudeWithinBounds")
  if (!governanceApproved) issues.push("governanceApproved")
  if (!rollbackPlanPresent) issues.push("rollbackPlanPresent")
  if (!impactScopeAcceptable) issues.push("impactScopeAcceptable")

  const verification: AutonomousActionVerification = {
    verificationId: crypto.randomUUID(),
    actionId,
    actionType,
    tenantId,
    magnitudeWithinBounds,
    governanceApproved,
    rollbackPlanPresent,
    impactScopeAcceptable,
    safeToExecute,
    issues,
    verifiedAt: new Date().toISOString(),
  }

  VERIFICATIONS.push(verification)
  return verification
}

export function getVerification(actionId: string): AutonomousActionVerification | undefined {
  return VERIFICATIONS.find((v) => v.actionId === actionId)
}

export function getBlockedActions(): AutonomousActionVerification[] {
  return VERIFICATIONS.filter((v) => !v.safeToExecute)
}

export function getVerificationSummary(): {
  total: number
  safe: number
  blocked: number
  safeRate: number
} {
  const safe = VERIFICATIONS.filter((v) => v.safeToExecute).length
  const safeRate = VERIFICATIONS.length === 0 ? 0 : safe / VERIFICATIONS.length
  return { total: VERIFICATIONS.length, safe, blocked: VERIFICATIONS.length - safe, safeRate }
}
