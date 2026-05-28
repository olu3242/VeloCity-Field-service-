import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface AIExecutionEconomics {
  economicsId: string
  modelId: string
  tenantId?: string
  inferenceCount: number
  avgInferenceMs: number
  totalTokens: number
  estimatedTokenCostUsd: number
  decisionsGenerated: number
  usefulDecisionRate: number
  costPerDecisionUsd: number
  valueScore: number
  calculatedAt: string
}

const AI_ECONOMICS: AIExecutionEconomics[] = []
const ROLLING_CAP = 500

export function calculateAIEconomics(
  modelId: string,
  inferenceCount: number,
  avgInferenceMs: number,
  totalTokens: number,
  decisionsGenerated: number,
  usefulDecisionRate: number,
  tenantId?: string
): AIExecutionEconomics {
  if (isRuntimePaused()) {
    logger.warn("calculateAIEconomics blocked: runtime paused", { modelId })
  }
  const estimatedTokenCostUsd = totalTokens * 0.000002
  const costPerDecisionUsd =
    decisionsGenerated > 0
      ? estimatedTokenCostUsd / decisionsGenerated
      : estimatedTokenCostUsd
  const valueScore = clampScore(
    usefulDecisionRate * 100 * 0.6 +
      Math.min(100, 1000 / Math.max(1, avgInferenceMs)) * 0.4
  )
  const record: AIExecutionEconomics = {
    economicsId: crypto.randomUUID(),
    modelId,
    tenantId,
    inferenceCount,
    avgInferenceMs,
    totalTokens,
    estimatedTokenCostUsd,
    decisionsGenerated,
    usefulDecisionRate,
    costPerDecisionUsd,
    valueScore,
    calculatedAt: new Date().toISOString(),
  }
  AI_ECONOMICS.push(record)
  if (AI_ECONOMICS.length > ROLLING_CAP) AI_ECONOMICS.shift()
  return record
}

export function getModelEconomics(
  modelId: string
): AIExecutionEconomics | undefined {
  return AI_ECONOMICS.find((e) => e.modelId === modelId)
}

export function getTopValueModels(limit = 10): AIExecutionEconomics[] {
  return [...AI_ECONOMICS]
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, limit)
}

export function getAIEconomicsSummary(): {
  total: number
  totalTokenCostUsd: number
  avgValueScore: number
  byModel: Record<string, number>
} {
  const total = AI_ECONOMICS.length
  const totalTokenCostUsd = AI_ECONOMICS.reduce(
    (s, e) => s + e.estimatedTokenCostUsd,
    0
  )
  const avgValueScore =
    total > 0
      ? AI_ECONOMICS.reduce((s, e) => s + e.valueScore, 0) / total
      : 0
  const byModel: Record<string, number> = {}
  for (const e of AI_ECONOMICS) {
    byModel[e.modelId] = (byModel[e.modelId] ?? 0) + e.estimatedTokenCostUsd
  }
  return { total, totalTokenCostUsd, avgValueScore, byModel }
}
