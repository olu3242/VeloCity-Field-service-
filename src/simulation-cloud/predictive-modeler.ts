import { logger } from "@/runtime-core/observability"

export interface PredictiveModel {
  modelId: string
  targetMetric: string
  tenantId?: string
  historicalDataPoints: number
  predictedValue: number
  predictionHorizonMinutes: number
  confidenceInterval: { low: number; high: number }
  trend: "increasing" | "decreasing" | "stable" | "volatile"
  anomalyProbability: number
  createdAt: string
}

const MODELS: PredictiveModel[] = []
const MODELS_CAP = 500

const TREND_OPTIONS: PredictiveModel["trend"][] = ["increasing", "decreasing", "stable", "volatile"]

function selectTrend(dataPoints: number): PredictiveModel["trend"] {
  if (dataPoints > 100) return "stable"
  const idx = Math.floor(Math.random() * TREND_OPTIONS.length)
  return TREND_OPTIONS[idx] ?? "stable"
}

export function generatePrediction(
  targetMetric: string,
  currentValue: number,
  dataPoints: number,
  horizonMinutes: number,
  tenantId?: string,
): PredictiveModel {
  if (MODELS.length >= MODELS_CAP) MODELS.shift()

  const rawPredicted = currentValue * (1 + Math.random() * 0.2 - 0.1)
  const predictedValue = Math.max(0, rawPredicted)
  const spread = predictedValue * 0.1
  const anomalyProbability = Math.min(1, Math.max(0, 0.05 + Math.random() * 0.15))

  const model: PredictiveModel = {
    modelId: crypto.randomUUID(),
    targetMetric,
    tenantId,
    historicalDataPoints: dataPoints,
    predictedValue,
    predictionHorizonMinutes: horizonMinutes,
    confidenceInterval: { low: predictedValue - spread, high: predictedValue + spread },
    trend: selectTrend(dataPoints),
    anomalyProbability,
    createdAt: new Date().toISOString(),
  }
  MODELS.push(model)
  logger.info("Prediction generated", "predictive-modeler", {
    metadata: { modelId: model.modelId, targetMetric, predictedValue },
  })
  return model
}

export function getLatestPrediction(targetMetric: string, tenantId?: string): PredictiveModel | undefined {
  const filtered = MODELS.filter(
    (m) => m.targetMetric === targetMetric && (tenantId === undefined || m.tenantId === tenantId),
  )
  return filtered[filtered.length - 1]
}

export function getAnomalyRiskMetrics(tenantId?: string): PredictiveModel[] {
  return MODELS.filter(
    (m) => m.anomalyProbability > 0.15 && (tenantId === undefined || m.tenantId === tenantId),
  )
}

export function getPredictionSummary(): {
  total: number
  byTrend: Record<string, number>
  highRiskCount: number
} {
  const byTrend: Record<string, number> = {}
  let highRiskCount = 0
  for (const m of MODELS) {
    byTrend[m.trend] = (byTrend[m.trend] ?? 0) + 1
    if (m.anomalyProbability > 0.15) highRiskCount++
  }
  return { total: MODELS.length, byTrend, highRiskCount }
}
