import { clampScore } from "@/runtime-core/scoring"

export type SafetyLevel = "safe" | "caution" | "unsafe" | "critical" | "emergency_stop"
export type SafetyDomain =
  | "execution"
  | "orchestration"
  | "federation"
  | "cognition"
  | "autonomy"
  | "governance"

export interface SafetyEvaluation {
  evaluationId: string
  domain: SafetyDomain
  entityId: string
  tenantId?: string
  safetyLevel: SafetyLevel
  safetyScore: number
  riskFactors: string[]
  mitigations: string[]
  approved: boolean
  evaluatedAt: string
}

const EVALUATIONS: SafetyEvaluation[] = []
const EVALUATIONS_CAP = 1000

function scoreToLevel(score: number): SafetyLevel {
  if (score >= 80) return "safe"
  if (score >= 60) return "caution"
  if (score >= 40) return "unsafe"
  if (score >= 20) return "critical"
  return "emergency_stop"
}

export function evaluate(
  domain: SafetyDomain,
  entityId: string,
  riskFactors: string[],
  tenantId?: string
): SafetyEvaluation {
  if (EVALUATIONS.length >= EVALUATIONS_CAP) EVALUATIONS.shift()

  const safetyScore = clampScore(100 - riskFactors.length * 15)
  const safetyLevel = scoreToLevel(safetyScore)
  const approved = safetyScore >= 60
  const mitigations =
    safetyScore < 80 ? riskFactors.map((rf) => `Mitigate ${rf}`) : []

  const evaluation: SafetyEvaluation = {
    evaluationId: crypto.randomUUID(),
    domain,
    entityId,
    tenantId,
    safetyLevel,
    safetyScore,
    riskFactors,
    mitigations,
    approved,
    evaluatedAt: new Date().toISOString(),
  }

  EVALUATIONS.push(evaluation)
  return evaluation
}

export function getEvaluation(entityId: string): SafetyEvaluation | undefined {
  return EVALUATIONS.find((e) => e.entityId === entityId)
}

export function getUnsafeEntities(domain?: SafetyDomain): SafetyEvaluation[] {
  return EVALUATIONS.filter(
    (e) =>
      !e.approved && (domain === undefined || e.domain === domain)
  )
}

export function getSafetySummary(): {
  total: number
  safe: number
  unsafe: number
  emergency: number
  avgScore: number
} {
  const safe = EVALUATIONS.filter((e) => e.approved).length
  const emergency = EVALUATIONS.filter((e) => e.safetyLevel === "emergency_stop").length
  const avgScore =
    EVALUATIONS.length === 0
      ? 0
      : EVALUATIONS.reduce((sum, e) => sum + e.safetyScore, 0) / EVALUATIONS.length
  return {
    total: EVALUATIONS.length,
    safe,
    unsafe: EVALUATIONS.length - safe,
    emergency,
    avgScore,
  }
}
