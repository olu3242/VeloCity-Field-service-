import { clampScore } from "@/runtime-core/scoring"

export interface OrchestrationRiskAssessment {
  assessmentId: string
  workflowId?: string
  workflowType: string
  tenantId?: string
  riskFactors: string[]
  riskScore: number
  riskLevel: "minimal" | "low" | "moderate" | "high" | "critical"
  mitigations: string[]
  approved: boolean
  assessedAt: string
}

const ASSESSMENTS: OrchestrationRiskAssessment[] = []
const ASSESSMENTS_CAP = 500

function scoreToLevel(score: number): OrchestrationRiskAssessment["riskLevel"] {
  if (score < 20) return "minimal"
  if (score < 40) return "low"
  if (score < 60) return "moderate"
  if (score < 80) return "high"
  return "critical"
}

export function assessRisk(
  workflowType: string,
  riskFactors: string[],
  workflowId?: string,
  tenantId?: string
): OrchestrationRiskAssessment {
  if (ASSESSMENTS.length >= ASSESSMENTS_CAP) ASSESSMENTS.shift()

  const riskScore = clampScore(riskFactors.length * 20)
  const riskLevel = scoreToLevel(riskScore)
  const mitigations =
    riskScore >= 40
      ? riskFactors.map((rf) => `Review ${rf} before execution`)
      : []
  const approved = riskScore < 70

  const assessment: OrchestrationRiskAssessment = {
    assessmentId: crypto.randomUUID(),
    workflowId,
    workflowType,
    tenantId,
    riskFactors,
    riskScore,
    riskLevel,
    mitigations,
    approved,
    assessedAt: new Date().toISOString(),
  }

  ASSESSMENTS.push(assessment)
  return assessment
}

export function getAssessment(workflowType: string): OrchestrationRiskAssessment | undefined {
  return ASSESSMENTS.find((a) => a.workflowType === workflowType)
}

export function getHighRiskAssessments(): OrchestrationRiskAssessment[] {
  return ASSESSMENTS.filter((a) => a.riskScore >= 60)
}

export function getRiskSummary(): {
  total: number
  approved: number
  denied: number
  avgRiskScore: number
} {
  const approved = ASSESSMENTS.filter((a) => a.approved).length
  const avgRiskScore =
    ASSESSMENTS.length === 0
      ? 0
      : ASSESSMENTS.reduce((sum, a) => sum + a.riskScore, 0) / ASSESSMENTS.length
  return {
    total: ASSESSMENTS.length,
    approved,
    denied: ASSESSMENTS.length - approved,
    avgRiskScore,
  }
}
