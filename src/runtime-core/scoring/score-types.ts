export type ScoreDimension =
  | "resilience"
  | "anomaly"
  | "confidence"
  | "risk"
  | "trust"
  | "optimization"
  | "forecast"
  | "compliance"
  | "health"
  | "maturity"

export type ScoreLevel = "critical" | "low" | "medium" | "high" | "excellent"

export interface NormalizedScore {
  value: number          // always 0-100
  dimension: ScoreDimension
  level: ScoreLevel
  confidence: number     // 0-1
  label: string          // human-readable e.g. "High Risk"
  entityId?: string
  tenantId?: string
  scoredAt: string
  explainability?: {
    factors: { name: string; contribution: number }[]
    reasoning: string
  }
}

// Canonical level thresholds — consistent across ALL scoring systems
export function scoreToLevel(value: number): ScoreLevel {
  if (value >= 90) return "excellent"
  if (value >= 70) return "high"
  if (value >= 50) return "medium"
  if (value >= 25) return "low"
  return "critical"
}

// For RISK and ANOMALY scores (inverted — higher = worse)
export function riskScoreToLevel(value: number): ScoreLevel {
  if (value >= 80) return "critical"
  if (value >= 60) return "high"
  if (value >= 40) return "medium"
  if (value >= 20) return "low"
  return "excellent"
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function buildScore(
  value: number,
  dimension: ScoreDimension,
  options?: {
    confidence?: number
    entityId?: string
    tenantId?: string
    factors?: { name: string; contribution: number }[]
    reasoning?: string
    invertLevel?: boolean  // true for risk/anomaly (higher=worse)
  }
): NormalizedScore {
  const clamped = clampScore(value)
  const level = options?.invertLevel ? riskScoreToLevel(clamped) : scoreToLevel(clamped)
  return {
    value: clamped,
    dimension,
    level,
    confidence: options?.confidence ?? 0.8,
    label: `${level.charAt(0).toUpperCase() + level.slice(1)} ${dimension.replace(/_/g, " ")}`,
    entityId: options?.entityId,
    tenantId: options?.tenantId,
    scoredAt: new Date().toISOString(),
    explainability: options?.factors
      ? { factors: options.factors, reasoning: options.reasoning ?? "" }
      : undefined,
  }
}
