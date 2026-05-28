import { logger } from "@/runtime-core/observability"

export type PredictionType = "failure" | "capacity_breach" | "latency_spike" | "queue_overflow" | "cascade_risk"

export interface PredictiveCognition {
  predictionId: string
  predictionType: PredictionType
  tenantId?: string
  targetSubsystem?: string
  probability: number
  timeHorizonMinutes: number
  triggerSignals: string[]
  cognitiveConfidence: number
  preventiveActions: string[]
  predictedAt: string
  expiresAt: string
}

const PREDICTIONS: PredictiveCognition[] = []
const MAX_PREDICTIONS = 500

const PREVENTIVE_ACTIONS: Record<PredictionType, string[]> = {
  failure: ["increase_retries", "enable_circuit_breaker"],
  capacity_breach: ["scale_out", "shed_load"],
  latency_spike: ["enable_caching", "reduce_batch_size"],
  queue_overflow: ["increase_consumers", "enable_backpressure"],
  cascade_risk: ["isolate_service", "activate_fallback"],
}

function computeProbability(signalCount: number): number {
  if (signalCount >= 3) return 0.75
  if (signalCount >= 2) return 0.55
  if (signalCount >= 1) return 0.35
  return 0.15
}

export function predict(
  type: PredictionType,
  triggerSignals: string[],
  horizonMinutes: number,
  targetSubsystem?: string,
  tenantId?: string,
): PredictiveCognition {
  const probability = computeProbability(triggerSignals.length)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + horizonMinutes * 60_000).toISOString()

  const prediction: PredictiveCognition = {
    predictionId: crypto.randomUUID(),
    predictionType: type,
    tenantId,
    targetSubsystem,
    probability,
    timeHorizonMinutes: horizonMinutes,
    triggerSignals: [...triggerSignals],
    cognitiveConfidence: probability * 0.9,
    preventiveActions: [...(PREVENTIVE_ACTIONS[type] ?? [])],
    predictedAt: now.toISOString(),
    expiresAt,
  }

  if (PREDICTIONS.length >= MAX_PREDICTIONS) PREDICTIONS.shift()
  PREDICTIONS.push(prediction)
  logger.info(`Prediction created: ${type}`, "predictive-cognition", {
    tenantId, metadata: { type, probability, horizonMinutes },
  })
  return prediction
}

export function getActivePredictions(tenantId?: string): PredictiveCognition[] {
  const now = new Date().toISOString()
  return PREDICTIONS.filter(
    (p) => p.expiresAt > now && (tenantId === undefined || p.tenantId === tenantId),
  )
}

export function getHighRiskPredictions(): PredictiveCognition[] {
  const now = new Date().toISOString()
  return PREDICTIONS.filter((p) => p.probability > 0.6 && p.expiresAt > now)
}

export function getPredictionSummary(): {
  total: number
  active: number
  highRisk: number
  byType: Record<string, number>
} {
  const now = new Date().toISOString()
  const byType: Record<string, number> = {}
  let active = 0
  let highRisk = 0
  for (const p of PREDICTIONS) {
    byType[p.predictionType] = (byType[p.predictionType] ?? 0) + 1
    if (p.expiresAt > now) { active += 1; if (p.probability > 0.6) highRisk += 1 }
  }
  return { total: PREDICTIONS.length, active, highRisk, byType }
}
