import { logger } from "@/runtime-core/observability"
import { clampScore, scoreToLevel } from "@/runtime-core/scoring"

export interface DeploymentScore {
  scoreId: string
  planId: string
  tenantId?: string
  dimensions: {
    codeConfidence: number
    infrastructureReadiness: number
    riskAdjustedScore: number
    historicalSuccessRate: number
    rollbackCapability: number
  }
  overallScore: number
  level: "critical" | "low" | "medium" | "high" | "excellent"
  recommendation: string
  scoredAt: string
}

const SCORES: Map<string, DeploymentScore> = new Map()

function buildRecommendation(level: DeploymentScore["level"]): string {
  switch (level) {
    case "excellent": return "Deploy immediately — all signals green"
    case "high": return "Proceed with standard monitoring"
    case "medium": return "Proceed with enhanced monitoring and staged rollout"
    case "low": return "Delay deployment — address low-confidence dimensions first"
    case "critical": return "Abort deployment — critical risk detected"
  }
}

export function scoreDeployment(
  planId: string,
  dimensions: DeploymentScore["dimensions"],
  tenantId?: string
): DeploymentScore {
  const weighted =
    dimensions.codeConfidence * 0.25 +
    dimensions.infrastructureReadiness * 0.20 +
    dimensions.riskAdjustedScore * 0.25 +
    dimensions.historicalSuccessRate * 0.20 +
    dimensions.rollbackCapability * 0.10

  const overallScore = clampScore(weighted)
  const level = scoreToLevel(overallScore)

  const score: DeploymentScore = {
    scoreId: crypto.randomUUID(),
    planId,
    tenantId,
    dimensions,
    overallScore,
    level,
    recommendation: buildRecommendation(level),
    scoredAt: new Date().toISOString(),
  }

  SCORES.set(planId, score)
  logger.info(`Deployment scored for plan ${planId}`, "deployment-scorer", {
    metadata: { overallScore, level },
  })
  return score
}

export function getScore(planId: string): DeploymentScore | undefined {
  return SCORES.get(planId)
}

export function getScoreSummary(): {
  total: number
  avgScore: number
  byLevel: Record<string, number>
} {
  const all = Array.from(SCORES.values())
  const total = all.length
  const avgScore = total > 0 ? Math.round(all.reduce((sum, s) => sum + s.overallScore, 0) / total) : 0
  const byLevel: Record<string, number> = {}
  for (const s of all) {
    byLevel[s.level] = (byLevel[s.level] ?? 0) + 1
  }
  return { total, avgScore, byLevel }
}
