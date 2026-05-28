import { type NormalizedScore, type ScoreDimension, buildScore, clampScore } from "./score-types"

export interface CompositeScore {
  overall: number        // 0-100 weighted average
  dimensions: NormalizedScore[]
  dominantDimension: ScoreDimension
  aggregatedAt: string
  entityId?: string
  tenantId?: string
}

export function aggregateScores(
  scores: NormalizedScore[],
  weights?: Partial<Record<ScoreDimension, number>>
): CompositeScore {
  if (scores.length === 0) {
    return {
      overall: 0,
      dimensions: [],
      dominantDimension: "health",
      aggregatedAt: new Date().toISOString(),
    }
  }

  let totalWeight = 0
  let weightedSum = 0
  let lowestValue = 100
  let dominantDimension: ScoreDimension = scores[0]?.dimension ?? "health"

  for (const score of scores) {
    const weight = weights?.[score.dimension] ?? 1
    weightedSum += score.value * weight
    totalWeight += weight
    if (score.value < lowestValue) {
      lowestValue = score.value
      dominantDimension = score.dimension
    }
  }

  const overall = clampScore(totalWeight > 0 ? weightedSum / totalWeight : 0)

  return {
    overall,
    dimensions: scores,
    dominantDimension,
    aggregatedAt: new Date().toISOString(),
    entityId: scores[0]?.entityId,
    tenantId: scores[0]?.tenantId,
  }
}

// Standard platform weights for operational composite
export const PLATFORM_SCORE_WEIGHTS: Partial<Record<ScoreDimension, number>> = {
  resilience: 0.25,
  health: 0.20,
  compliance: 0.15,
  trust: 0.15,
  risk: 0.10,        // inverted: low risk = high score
  maturity: 0.15,
}

export function buildPlatformComposite(scores: NormalizedScore[]): CompositeScore {
  return aggregateScores(scores, PLATFORM_SCORE_WEIGHTS)
}

// Normalize any raw 0-100 value from existing scoring systems into NormalizedScore
export function normalizeExternalScore(
  rawValue: number,
  dimension: ScoreDimension,
  entityId?: string,
  tenantId?: string
): NormalizedScore {
  return buildScore(rawValue, dimension, { entityId, tenantId })
}
