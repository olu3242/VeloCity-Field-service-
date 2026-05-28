export interface BalancePrediction {
  predictionId: string
  targetPartitionId?: string
  region?: string
  tenantId?: string
  predictedLoadPct: number
  timeHorizonMinutes: number
  confidence: number
  trigger: "trending_up" | "trending_down" | "spike_predicted" | "stable"
  recommendedAction?: string
  predictedAt: string
}

const PREDICTIONS: BalancePrediction[] = []
const CAP = 500

export function predictBalance(
  currentLoad: number,
  trendDirection: "up" | "down" | "flat",
  horizonMinutes: number,
  partitionId?: string,
  region?: string,
  tenantId?: string
): BalancePrediction {
  if (PREDICTIONS.length >= CAP) PREDICTIONS.shift()

  let predictedLoadPct: number
  if (trendDirection === "up") {
    predictedLoadPct = Math.min(100, currentLoad * 1.2)
  } else if (trendDirection === "down") {
    predictedLoadPct = Math.max(0, currentLoad * 0.85)
  } else {
    predictedLoadPct = currentLoad
  }

  let trigger: BalancePrediction["trigger"]
  if (trendDirection === "up" && predictedLoadPct > 80) {
    trigger = "spike_predicted"
  } else if (trendDirection === "up") {
    trigger = "trending_up"
  } else if (trendDirection === "down") {
    trigger = "trending_down"
  } else {
    trigger = "stable"
  }

  let recommendedAction: string | undefined
  if (trigger === "spike_predicted") recommendedAction = "scale_up_now"
  else if (trigger === "trending_up") recommendedAction = "plan_scaling"

  const confidenceBonus =
    horizonMinutes <= 5 ? 0.15 : horizonMinutes <= 15 ? 0.05 : 0.0
  const confidence = 0.70 + confidenceBonus

  const prediction: BalancePrediction = {
    predictionId: crypto.randomUUID(),
    targetPartitionId: partitionId,
    region,
    tenantId,
    predictedLoadPct,
    timeHorizonMinutes: horizonMinutes,
    confidence,
    trigger,
    recommendedAction,
    predictedAt: new Date().toISOString(),
  }
  PREDICTIONS.push(prediction)
  return prediction
}

export function getHighRiskPredictions(): BalancePrediction[] {
  return PREDICTIONS.filter(p => p.predictedLoadPct > 80)
}

export function getPredictionSummary(): {
  total: number
  byTrigger: Record<string, number>
  avgConfidence: number
} {
  const byTrigger: Record<string, number> = {}
  let totalConfidence = 0
  for (const p of PREDICTIONS) {
    byTrigger[p.trigger] = (byTrigger[p.trigger] ?? 0) + 1
    totalConfidence += p.confidence
  }
  return {
    total: PREDICTIONS.length,
    byTrigger,
    avgConfidence: PREDICTIONS.length > 0 ? totalConfidence / PREDICTIONS.length : 0,
  }
}
