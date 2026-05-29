import { clampScore } from "@/runtime-core/scoring"
import { logger } from "@/runtime-core/observability"

export type SignalSource =
  | "telemetry"
  | "orchestration"
  | "federation"
  | "cognition"
  | "user_feedback"
  | "anomaly_detector"

export interface FusedSignal {
  fusionId: string
  correlationId: string
  tenantId?: string
  signals: { source: SignalSource; value: number; weight: number }[]
  fusedScore: number
  dominantSource: SignalSource
  confidence: number
  fusedAt: string
}

const FUSIONS: FusedSignal[] = []
const FUSIONS_CAP = 500

export function fuseSignals(
  correlationId: string,
  signals: { source: SignalSource; value: number; weight: number }[],
  tenantId?: string
): FusedSignal {
  if (signals.length === 0) {
    logger.warn("fuseSignals called with empty signals array")
    throw new Error("No signals provided")
  }
  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0)
  const weightedSum = signals.reduce((s, sig) => s + sig.value * sig.weight, 0)
  const fusedScore = clampScore(weightedSum / Math.max(1, totalWeight))

  const dominant = signals.reduce((prev, curr) => (curr.weight > prev.weight ? curr : prev))
  const confidence = Math.min(0.99, signals.length * 0.15)

  const fusion: FusedSignal = {
    fusionId: crypto.randomUUID(),
    correlationId,
    tenantId,
    signals,
    fusedScore,
    dominantSource: dominant.source,
    confidence,
    fusedAt: new Date().toISOString(),
  }
  FUSIONS.push(fusion)
  if (FUSIONS.length > FUSIONS_CAP) FUSIONS.splice(0, FUSIONS.length - FUSIONS_CAP)
  return fusion
}

export function getFusion(correlationId: string): FusedSignal | undefined {
  return FUSIONS.find((f) => f.correlationId === correlationId)
}

export function getHighConfidenceFusions(): FusedSignal[] {
  return FUSIONS.filter((f) => f.confidence >= 0.75)
}

export function getFusionSummary(): {
  total: number
  avgScore: number
  avgConfidence: number
  byDominantSource: Record<string, number>
} {
  const total = FUSIONS.length
  const avgScore = total > 0 ? FUSIONS.reduce((s, f) => s + f.fusedScore, 0) / total : 0
  const avgConfidence = total > 0 ? FUSIONS.reduce((s, f) => s + f.confidence, 0) / total : 0
  const byDominantSource: Record<string, number> = {}
  for (const f of FUSIONS) {
    byDominantSource[f.dominantSource] = (byDominantSource[f.dominantSource] ?? 0) + 1
  }
  return { total, avgScore, avgConfidence, byDominantSource }
}
