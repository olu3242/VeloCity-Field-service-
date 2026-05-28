import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"
import { recordDecision } from "./runtime-brain"

export interface DeploymentReasoning {
  reasoningId: string
  deploymentPlanId: string
  tenantId?: string
  safetyScore: number
  proceedRecommendation: "proceed" | "delay" | "abort"
  riskFactors: string[]
  mitigations: string[]
  confidence: number
  reasoning: string
  reasonedAt: string
}

const REASONING_LOG: DeploymentReasoning[] = []
const CAP = 200

function buildRiskAndMitigations(safetyScore: number): { riskFactors: string[]; mitigations: string[] } {
  if (safetyScore >= 70) {
    return {
      riskFactors: ["Minor blast radius", "Low dependency coupling"],
      mitigations: ["Monitor post-deploy metrics", "Enable feature flag rollback"],
    }
  }
  if (safetyScore >= 50) {
    return {
      riskFactors: ["Moderate blast radius", "Some downstream dependencies"],
      mitigations: ["Phased rollout", "Increase observation window", "Prepare rollback plan"],
    }
  }
  return {
    riskFactors: ["High blast radius", "Critical dependencies affected", "Low confidence score"],
    mitigations: ["Abort and re-plan", "Reduce scope", "Increase test coverage before retry"],
  }
}

export function reasonDeployment(
  deploymentPlanId: string,
  blastRadius: number,
  confidenceScore: number,
  tenantId?: string,
): DeploymentReasoning {
  if (isRuntimePaused()) {
    logger.warn("reasonDeployment blocked: runtime paused", "deployment-reasoning")
  }
  const raw = (100 - blastRadius) * 0.6 + confidenceScore * 0.4
  const safetyScore = clampScore(raw)
  const proceedRecommendation: DeploymentReasoning["proceedRecommendation"] =
    safetyScore >= 70 ? "proceed" : safetyScore >= 50 ? "delay" : "abort"
  const { riskFactors, mitigations } = buildRiskAndMitigations(safetyScore)
  const confidence = safetyScore >= 70 ? 0.88 : safetyScore >= 50 ? 0.72 : 0.60
  const rec: DeploymentReasoning = {
    reasoningId: crypto.randomUUID(),
    deploymentPlanId,
    tenantId,
    safetyScore,
    proceedRecommendation,
    riskFactors,
    mitigations,
    confidence,
    reasoning: `Safety score ${safetyScore}/100 (blast=${blastRadius}, conf=${confidenceScore}) → ${proceedRecommendation}`,
    reasonedAt: new Date().toISOString(),
  }
  if (REASONING_LOG.length >= CAP) REASONING_LOG.shift()
  REASONING_LOG.push(rec)
  recordDecision("deployment", confidence)
  logger.info(`Deployment reasoning: ${proceedRecommendation} safetyScore=${safetyScore}`, "deployment-reasoning", { tenantId })
  return rec
}

export function getLatestReasoning(deploymentPlanId: string): DeploymentReasoning | undefined {
  for (let i = REASONING_LOG.length - 1; i >= 0; i--) {
    if (REASONING_LOG[i]?.deploymentPlanId === deploymentPlanId) return REASONING_LOG[i]
  }
  return undefined
}

export function getReasoningSummary(): {
  total: number; byRecommendation: Record<string, number>; avgSafetyScore: number
} {
  const byRecommendation: Record<string, number> = {}
  let totalSafety = 0
  for (const r of REASONING_LOG) {
    byRecommendation[r.proceedRecommendation] = (byRecommendation[r.proceedRecommendation] ?? 0) + 1
    totalSafety += r.safetyScore
  }
  return {
    total: REASONING_LOG.length,
    byRecommendation,
    avgSafetyScore: REASONING_LOG.length > 0 ? totalSafety / REASONING_LOG.length : 0,
  }
}
