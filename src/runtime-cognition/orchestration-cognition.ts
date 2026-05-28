import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface OrchestrationCognition {
  cognitionId: string
  workflowType: string
  tenantId?: string
  recommendedPattern: string
  stepCognition: {
    stepIndex: number
    predictedDurationMs: number
    riskLevel: "low" | "medium" | "high"
    cognitiveNote: string
  }[]
  overallConfidence: number
  cognitiveLoad: number
  createdAt: string
}

const COGNITIONS: OrchestrationCognition[] = []
const MAX_COGNITIONS = 500

function derivePattern(stepCount: number): string {
  if (stepCount <= 3) return "sequential"
  if (stepCount <= 8) return "parallel_fan_out"
  return "saga"
}

function deriveRisk(index: number, total: number): "low" | "medium" | "high" {
  const position = total > 1 ? index / (total - 1) : 0
  if (position < 0.33) return "low"
  if (position < 0.66) return "medium"
  return "high"
}

export function cognitizeOrchestration(
  workflowType: string,
  stepCount: number,
  tenantId?: string,
): OrchestrationCognition {
  const cognitiveLoad = clampScore(stepCount * 10)
  const recommendedPattern = derivePattern(stepCount)
  const rawConf = Math.max(0.50, Math.min(0.90, 0.80 - stepCount * 0.02))

  const stepCognition = Array.from({ length: stepCount }, (_, i) => ({
    stepIndex: i,
    predictedDurationMs: 200 + i * 50,
    riskLevel: deriveRisk(i, stepCount),
    cognitiveNote: `Step ${i} in ${recommendedPattern} pattern`,
  }))

  const cognition: OrchestrationCognition = {
    cognitionId: crypto.randomUUID(),
    workflowType,
    tenantId,
    recommendedPattern,
    stepCognition,
    overallConfidence: rawConf,
    cognitiveLoad,
    createdAt: new Date().toISOString(),
  }

  if (COGNITIONS.length >= MAX_COGNITIONS) COGNITIONS.shift()
  COGNITIONS.push(cognition)
  logger.info(`Orchestration cognition created for ${workflowType}`, "orchestration-cognition", {
    tenantId, metadata: { pattern: recommendedPattern, steps: stepCount },
  })
  return cognition
}

export function getLatestCognition(workflowType: string): OrchestrationCognition | undefined {
  for (let i = COGNITIONS.length - 1; i >= 0; i--) {
    if (COGNITIONS[i]?.workflowType === workflowType) return COGNITIONS[i]
  }
  return undefined
}

export function getCognitionStats(): {
  total: number
  avgCognitiveLoad: number
  avgConfidence: number
  byPattern: Record<string, number>
} {
  const byPattern: Record<string, number> = {}
  let totalLoad = 0
  let totalConf = 0
  for (const c of COGNITIONS) {
    byPattern[c.recommendedPattern] = (byPattern[c.recommendedPattern] ?? 0) + 1
    totalLoad += c.cognitiveLoad
    totalConf += c.overallConfidence
  }
  const total = COGNITIONS.length
  return { total, avgCognitiveLoad: total > 0 ? totalLoad / total : 0, avgConfidence: total > 0 ? totalConf / total : 0, byPattern }
}
