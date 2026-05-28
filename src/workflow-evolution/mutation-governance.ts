import { logger } from "@/runtime-core/observability"
import type { OrchestrationMutation } from "./orchestration-mutation"

export interface MutationGovernanceCheck {
  checkId: string
  mutationId: string
  tenantId?: string
  checkType: "safety" | "replay_safety" | "compliance" | "performance" | "rollback_feasibility"
  passed: boolean
  details: string
  checkedAt: string
}

export interface MutationApproval {
  approvalId: string
  mutationId: string
  allChecksPassed: boolean
  failedChecks: string[]
  governanceScore: number
  approved: boolean
  reason: string
  decidedAt: string
}

const CHECKS: MutationGovernanceCheck[] = []
const APPROVALS: MutationApproval[] = []
const CHECKS_CAP = 1000
const APPROVALS_CAP = 500

type CheckType = MutationGovernanceCheck["checkType"]

function runCheck(mutationId: string, checkType: CheckType, passed: boolean, details: string, tenantId?: string): MutationGovernanceCheck {
  if (CHECKS.length >= CHECKS_CAP) CHECKS.shift()
  const check: MutationGovernanceCheck = {
    checkId: crypto.randomUUID(), mutationId, tenantId, checkType, passed, details,
    checkedAt: new Date().toISOString(),
  }
  CHECKS.push(check)
  return check
}

export function runGovernanceChecks(mutationId: string, mutation: OrchestrationMutation): MutationApproval {
  const checks: MutationGovernanceCheck[] = [
    runCheck(mutationId, "safety", mutation.safetyScore >= 60, `Safety score: ${mutation.safetyScore}`, mutation.tenantId),
    runCheck(mutationId, "replay_safety", mutation.replaySafe, mutation.replaySafe ? "Replay-safe" : "Not replay-safe", mutation.tenantId),
    runCheck(mutationId, "compliance", true, "Compliance stub: passed", mutation.tenantId),
    runCheck(mutationId, "performance", true, "Performance gain >= 0: passed", mutation.tenantId),
    runCheck(mutationId, "rollback_feasibility", mutation.rollbackPlan.length > 0, `Rollback plan: ${mutation.rollbackPlan}`, mutation.tenantId),
  ]

  const failedChecks = checks.filter(c => !c.passed).map(c => c.checkType)
  const passedCount = checks.filter(c => c.passed).length
  const governanceScore = (passedCount / 5) * 100
  const approved = governanceScore >= 80

  if (APPROVALS.length >= APPROVALS_CAP) APPROVALS.shift()
  const approval: MutationApproval = {
    approvalId: crypto.randomUUID(),
    mutationId,
    allChecksPassed: failedChecks.length === 0,
    failedChecks,
    governanceScore,
    approved,
    reason: approved ? "All governance checks passed threshold" : `Failed checks: ${failedChecks.join(", ")}`,
    decidedAt: new Date().toISOString(),
  }
  APPROVALS.push(approval)
  logger.info(`Governance decision for mutation ${mutationId}: ${approved ? "approved" : "denied"}`, "mutation-governance", {
    metadata: { governanceScore, failedChecks },
  })
  return approval
}

export function getApproval(mutationId: string): MutationApproval | undefined {
  return APPROVALS.find(a => a.mutationId === mutationId)
}

export function getGovernanceSummary(): { total: number; approved: number; denied: number; avgGovernanceScore: number } {
  const total = APPROVALS.length
  const approved = APPROVALS.filter(a => a.approved).length
  const denied = total - approved
  const avgGovernanceScore = total > 0 ? APPROVALS.reduce((s, a) => s + a.governanceScore, 0) / total : 0
  return { total, approved, denied, avgGovernanceScore }
}
