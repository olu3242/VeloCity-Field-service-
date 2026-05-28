import { logger } from "@/runtime-core/observability"
import { evaluatePolicy } from "./runtime-policy"
import { getConstitution } from "./runtime-constitution"
import { getComplianceScore } from "./compliance-runtime"

export interface GovernanceDecision {
  decisionId: string
  requestType: string
  tenantId?: string
  entityId: string
  decision: "approved" | "denied" | "conditional" | "deferred"
  conditions?: string[]
  reason: string
  policyMatches: number
  constitutionChecks: number
  complianceScore: number
  decidedAt: string
}

const DECISIONS: GovernanceDecision[] = []
const DECISIONS_CAP = 2000

export function evaluate(
  requestType: string,
  entityId: string,
  context: Record<string, unknown>,
  tenantId?: string
): GovernanceDecision {
  // Policy evaluation
  const policyResult = evaluatePolicy(requestType, requestType, context, tenantId)
  const policyMatches = policyResult.matchedPolicies.length

  // Constitution checks — count all principles
  const constitution = getConstitution()
  const constitutionChecks = constitution.length

  // Compliance score
  const complianceScore = getComplianceScore(entityId) ?? 100

  // Decision logic
  let decision: GovernanceDecision["decision"]
  let reason: string
  let conditions: string[] | undefined

  if (policyResult.action === "deny") {
    decision = "denied"
    reason = `Policy evaluation returned deny action (${policyMatches} matched policies)`
  } else if (policyResult.action === "require_approval") {
    decision = "conditional"
    reason = "Policy requires approval before proceeding"
    conditions = ["Awaiting manual approval"]
  } else {
    decision = "approved"
    reason = `Approved: policy action=${policyResult.action}, compliance=${complianceScore}`
  }

  if (DECISIONS.length >= DECISIONS_CAP) DECISIONS.shift()

  const governanceDecision: GovernanceDecision = {
    decisionId: crypto.randomUUID(),
    requestType,
    tenantId,
    entityId,
    decision,
    conditions,
    reason,
    policyMatches,
    constitutionChecks,
    complianceScore,
    decidedAt: new Date().toISOString(),
  }

  DECISIONS.push(governanceDecision)
  logger.info(
    `Governance decision: ${decision} for ${requestType}`,
    "governance-engine",
    { metadata: { decisionId: governanceDecision.decisionId, entityId, decision } }
  )
  return governanceDecision
}

export function getDecisionHistory(entityId: string, limit = 50): GovernanceDecision[] {
  return DECISIONS.filter((d) => d.entityId === entityId).slice(-limit)
}

export function getGovernanceSummary(): {
  total: number
  approved: number
  denied: number
  conditional: number
  denialRate: number
} {
  let approved = 0, denied = 0, conditional = 0
  for (const d of DECISIONS) {
    if (d.decision === "approved") approved++
    else if (d.decision === "denied") denied++
    else if (d.decision === "conditional") conditional++
  }
  const total = DECISIONS.length
  return {
    total,
    approved,
    denied,
    conditional,
    denialRate: total > 0 ? denied / total : 0,
  }
}
