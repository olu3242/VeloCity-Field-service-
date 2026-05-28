import { clampScore } from "@/runtime-core/scoring"

export type ArbitrationDecision =
  | "proceed"
  | "proceed_with_monitoring"
  | "require_approval"
  | "block"
  | "emergency_stop"

export interface RuntimeArbitration {
  arbitrationId: string
  requestType: string
  entityId: string
  tenantId?: string
  safetyScore: number
  governanceScore: number
  riskScore: number
  confidenceScore: number
  compositeScore: number
  decision: ArbitrationDecision
  reasoning: string
  auditTrail: string[]
  arbitratedAt: string
}

const ARBITRATIONS: RuntimeArbitration[] = []
const ARBITRATIONS_CAP = 1000

function scoreToDecision(score: number): ArbitrationDecision {
  if (score >= 80) return "proceed"
  if (score >= 65) return "proceed_with_monitoring"
  if (score >= 50) return "require_approval"
  if (score >= 30) return "block"
  return "emergency_stop"
}

export function arbitrate(
  requestType: string,
  entityId: string,
  scores: { safety: number; governance: number; risk: number; confidence: number },
  tenantId?: string
): RuntimeArbitration {
  if (ARBITRATIONS.length >= ARBITRATIONS_CAP) ARBITRATIONS.shift()

  const rawComposite =
    scores.safety * 0.3 +
    scores.governance * 0.3 +
    (100 - scores.risk) * 0.2 +
    scores.confidence * 100 * 0.2
  const compositeScore = clampScore(rawComposite)
  const decision = scoreToDecision(compositeScore)
  const reasoning = `Composite score ${compositeScore} based on safety/governance/risk/confidence signals`

  const auditTrail = [
    `safety: ${scores.safety} (weight 0.3, contribution ${Math.round(scores.safety * 0.3)})`,
    `governance: ${scores.governance} (weight 0.3, contribution ${Math.round(scores.governance * 0.3)})`,
    `risk: ${scores.risk} (inverted weight 0.2, contribution ${Math.round((100 - scores.risk) * 0.2)})`,
    `confidence: ${scores.confidence} (scaled weight 0.2, contribution ${Math.round(scores.confidence * 100 * 0.2)})`,
  ]

  const arbitration: RuntimeArbitration = {
    arbitrationId: crypto.randomUUID(),
    requestType,
    entityId,
    tenantId,
    safetyScore: scores.safety,
    governanceScore: scores.governance,
    riskScore: scores.risk,
    confidenceScore: scores.confidence,
    compositeScore,
    decision,
    reasoning,
    auditTrail,
    arbitratedAt: new Date().toISOString(),
  }

  ARBITRATIONS.push(arbitration)
  return arbitration
}

export function getArbitration(entityId: string): RuntimeArbitration | undefined {
  return ARBITRATIONS.find((a) => a.entityId === entityId)
}

export function getBlockedRequests(): RuntimeArbitration[] {
  return ARBITRATIONS.filter(
    (a) => a.decision === "block" || a.decision === "emergency_stop"
  )
}

export function getArbitrationSummary(): {
  total: number
  byDecision: Record<string, number>
  avgCompositeScore: number
} {
  const byDecision: Record<string, number> = {}
  for (const a of ARBITRATIONS) {
    byDecision[a.decision] = (byDecision[a.decision] ?? 0) + 1
  }
  const avgCompositeScore =
    ARBITRATIONS.length === 0
      ? 0
      : ARBITRATIONS.reduce((sum, a) => sum + a.compositeScore, 0) / ARBITRATIONS.length
  return { total: ARBITRATIONS.length, byDecision, avgCompositeScore }
}
