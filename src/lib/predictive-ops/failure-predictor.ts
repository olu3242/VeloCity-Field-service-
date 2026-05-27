export interface FailurePrediction {
  id: string
  component: string
  tenantId?: string
  failureType: "overload" | "memory_exhaustion" | "circuit_trip" | "timeout_cascade" | "cost_spike"
  probabilityScore: number
  timeToFailureMs?: number
  confidence: number
  signals: string[]
  predictedAt: string
  acknowledged: boolean
}

const PREDICTIONS: FailurePrediction[] = []
const CAP = 300
const KNOWN_FAILURE_TYPES = new Set<string>(["overload", "memory_exhaustion", "circuit_trip", "timeout_cascade", "cost_spike"])

export function predictFailure(
  component: string,
  signals: { type: string; weight: number }[],
  tenantId?: string
): FailurePrediction | null {
  const probabilityScore = Math.min(1, signals.reduce((s, sig) => s + sig.weight, 0))
  if (probabilityScore <= 0.3) return null

  let timeToFailureMs: number | undefined
  if (probabilityScore > 0.8) timeToFailureMs = 300_000
  else if (probabilityScore > 0.5) timeToFailureMs = 900_000

  const confidence = Math.min(0.9, signals.length * 0.15)

  const sorted = [...signals].sort((a, b) => b.weight - a.weight)
  const topType = sorted[0]?.type ?? "timeout_cascade"
  const failureType = (KNOWN_FAILURE_TYPES.has(topType) ? topType : "timeout_cascade") as FailurePrediction["failureType"]

  const prediction: FailurePrediction = {
    id: crypto.randomUUID(),
    component,
    tenantId,
    failureType,
    probabilityScore,
    timeToFailureMs,
    confidence,
    signals: signals.map(s => `${s.type}:${s.weight.toFixed(2)}`),
    predictedAt: new Date().toISOString(),
    acknowledged: false,
  }

  if (PREDICTIONS.length >= CAP) PREDICTIONS.shift()
  PREDICTIONS.push(prediction)
  return prediction
}

export function getHighProbabilityFailures(threshold = 0.6): FailurePrediction[] {
  return PREDICTIONS.filter(p => p.probabilityScore > threshold && !p.acknowledged)
}

export function acknowledgeFailurePrediction(id: string): void {
  const pred = PREDICTIONS.find(p => p.id === id)
  if (pred) pred.acknowledged = true
}

export function getPredictionAccuracy(): { total: number; acknowledged: number; avgConfidence: number } {
  const acknowledged = PREDICTIONS.filter(p => p.acknowledged).length
  const totalConf = PREDICTIONS.reduce((s, p) => s + p.confidence, 0)
  return {
    total: PREDICTIONS.length,
    acknowledged,
    avgConfidence: PREDICTIONS.length > 0 ? totalConf / PREDICTIONS.length : 0,
  }
}
