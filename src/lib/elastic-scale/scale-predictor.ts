export interface ScalePrediction {
  id: string
  resourceType: "workers" | "queues" | "ai_capacity" | "memory"
  currentLevel: number
  predictedLevel: number
  recommendedAction: "scale_up" | "scale_down" | "hold"
  confidence: number
  windowMinutes: number
  predictedAt: string
}

const PREDICTIONS: ScalePrediction[] = []
const PREDICTION_CAP = 100

export function predictScale(
  resourceType: ScalePrediction["resourceType"],
  currentLevel: number,
  historicalLevels: number[],
  windowMinutes: number,
): ScalePrediction {
  const recentAvg = historicalLevels.length >= 3
    ? historicalLevels.slice(-3).reduce((s, v) => s + v, 0) / 3
    : currentLevel

  const overallAvg = historicalLevels.length > 0
    ? historicalLevels.reduce((s, v) => s + v, 0) / historicalLevels.length
    : currentLevel

  let recommendedAction: ScalePrediction["recommendedAction"] = "hold"
  if (overallAvg > 0) {
    const changePct = (recentAvg - overallAvg) / overallAvg
    if (changePct > 0.2) recommendedAction = "scale_up"
    else if (changePct < -0.2) recommendedAction = "scale_down"
  }

  const confidence = Math.min(0.95, historicalLevels.length / 10)
  const predictedLevel = recommendedAction === "scale_up"
    ? Math.ceil(currentLevel * 1.2)
    : recommendedAction === "scale_down"
    ? Math.ceil(currentLevel * 0.8)
    : currentLevel

  const prediction: ScalePrediction = {
    id: crypto.randomUUID(),
    resourceType,
    currentLevel,
    predictedLevel,
    recommendedAction,
    confidence,
    windowMinutes,
    predictedAt: new Date().toISOString(),
  }
  PREDICTIONS.push(prediction)
  if (PREDICTIONS.length > PREDICTION_CAP) PREDICTIONS.splice(0, PREDICTIONS.length - PREDICTION_CAP)
  return prediction
}

export function getLatestPrediction(resourceType: ScalePrediction["resourceType"]): ScalePrediction | undefined {
  return [...PREDICTIONS].reverse().find((p) => p.resourceType === resourceType)
}

export function getScaleRecommendations(): ScalePrediction[] {
  return PREDICTIONS.filter((p) => p.recommendedAction !== "hold")
}
