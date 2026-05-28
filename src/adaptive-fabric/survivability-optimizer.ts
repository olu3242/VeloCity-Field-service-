import { clampScore } from "@/runtime-core/scoring"

export interface SurvivabilityAssessment {
  assessmentId: string
  tenantId?: string
  region?: string
  survivabilityScore: number
  redundancyLevel: number
  singlePointsOfFailure: string[]
  recommendations: string[]
  riskLevel: "low" | "medium" | "high" | "critical"
  assessedAt: string
}

const ASSESSMENTS: SurvivabilityAssessment[] = []
const CAP = 200

function scoreToRisk(score: number): SurvivabilityAssessment["riskLevel"] {
  if (score >= 80) return "low"
  if (score >= 60) return "medium"
  if (score >= 40) return "high"
  return "critical"
}

export function assessSurvivability(
  partitionCount: number,
  regionCount: number,
  replicationFactor: number,
  tenantId?: string,
  region?: string
): SurvivabilityAssessment {
  if (ASSESSMENTS.length >= CAP) ASSESSMENTS.shift()

  const redundancyLevel = Math.max(0, Math.min(1, replicationFactor / 3))
  const rawScore = partitionCount * 10 + regionCount * 20 + redundancyLevel * 70
  const survivabilityScore = clampScore(rawScore)
  const riskLevel = scoreToRisk(survivabilityScore)

  const singlePointsOfFailure: string[] = []
  if (partitionCount < 2) singlePointsOfFailure.push("single_partition")
  if (regionCount < 2) singlePointsOfFailure.push("single_region")

  const recommendations: string[] = []
  if (partitionCount < 2) recommendations.push("Increase partition count to at least 2")
  if (regionCount < 2) recommendations.push("Deploy to multiple regions")
  if (replicationFactor < 2) recommendations.push("Increase replication factor")

  const assessment: SurvivabilityAssessment = {
    assessmentId: crypto.randomUUID(),
    tenantId,
    region,
    survivabilityScore,
    redundancyLevel,
    singlePointsOfFailure,
    recommendations,
    riskLevel,
    assessedAt: new Date().toISOString(),
  }
  ASSESSMENTS.push(assessment)
  return assessment
}

export function getLatestAssessment(region?: string): SurvivabilityAssessment | undefined {
  const filtered = region ? ASSESSMENTS.filter(a => a.region === region) : ASSESSMENTS
  return filtered[filtered.length - 1]
}

export function getAssessmentSummary(): {
  total: number
  avgScore: number
  criticalCount: number
} {
  let totalScore = 0
  let criticalCount = 0
  for (const a of ASSESSMENTS) {
    totalScore += a.survivabilityScore
    if (a.riskLevel === "critical") criticalCount += 1
  }
  return {
    total: ASSESSMENTS.length,
    avgScore: ASSESSMENTS.length > 0 ? totalScore / ASSESSMENTS.length : 0,
    criticalCount,
  }
}
