import { logger } from "@/runtime-core/observability"

export type InferredIntent =
  | "scale_up"
  | "scale_down"
  | "failover"
  | "optimize"
  | "investigate"
  | "rollback"
  | "maintain"

export interface IntentInference {
  inferenceId: string
  orchestrationId: string
  tenantId?: string
  observedSignals: string[]
  inferredIntent: InferredIntent
  confidence: number
  alternativeIntents: InferredIntent[]
  actionablePlan: string
  inferredAt: string
}

const INFERENCES: IntentInference[] = []
const INFERENCES_CAP = 500

function deriveIntent(signals: string[]): InferredIntent {
  if (signals.includes("high_load")) return "scale_up"
  if (signals.includes("low_load")) return "scale_down"
  if (signals.includes("failure")) return "failover"
  if (signals.includes("drift")) return "investigate"
  return "maintain"
}

export function inferIntent(
  orchestrationId: string,
  signals: string[],
  tenantId?: string
): IntentInference {
  const inferredIntent = deriveIntent(signals)
  const confidence = Math.min(0.99, 0.75 + 0.05 * Math.min(signals.length, 5))
  const allAlternatives: InferredIntent[] = ["investigate", "optimize"]
  const alternativeIntents = allAlternatives.filter((i) => i !== inferredIntent)

  const inference: IntentInference = {
    inferenceId: crypto.randomUUID(),
    orchestrationId,
    tenantId,
    observedSignals: signals,
    inferredIntent,
    confidence,
    alternativeIntents,
    actionablePlan: `Execute ${inferredIntent} for orchestration ${orchestrationId}`,
    inferredAt: new Date().toISOString(),
  }
  INFERENCES.push(inference)
  if (INFERENCES.length > INFERENCES_CAP) INFERENCES.splice(0, INFERENCES.length - INFERENCES_CAP)
  logger.info(`Intent inferred: ${inferredIntent} for ${orchestrationId}`)
  return inference
}

export function getInference(orchestrationId: string): IntentInference | undefined {
  return INFERENCES.find((i) => i.orchestrationId === orchestrationId)
}

export function getInferencesByIntent(intent: InferredIntent): IntentInference[] {
  return INFERENCES.filter((i) => i.inferredIntent === intent)
}

export function getIntentSummary(): {
  total: number
  byIntent: Record<string, number>
  avgConfidence: number
} {
  const total = INFERENCES.length
  const byIntent: Record<string, number> = {}
  for (const i of INFERENCES) {
    byIntent[i.inferredIntent] = (byIntent[i.inferredIntent] ?? 0) + 1
  }
  const avgConfidence =
    total > 0 ? INFERENCES.reduce((s, i) => s + i.confidence, 0) / total : 0
  return { total, byIntent, avgConfidence }
}
