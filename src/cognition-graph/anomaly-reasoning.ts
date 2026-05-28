import { clampScore } from "@/runtime-core/scoring"

export type AnomalyClass =
  | "performance"
  | "data_integrity"
  | "behavioral"
  | "cascading"
  | "threshold_breach"
  | "pattern_deviation"

export interface AnomalyReasoning {
  reasoningId: string
  anomalyId: string
  tenantId?: string
  anomalyClass: AnomalyClass
  rootCauses: string[]
  propagationPath: string[]
  impactScore: number
  confidence: number
  reasoning: string
  suggestedActions: string[]
  reasonedAt: string
}

const REASONINGS: AnomalyReasoning[] = []
const REASONINGS_CAP = 500

export function reasonAboutAnomaly(
  anomalyId: string,
  cls: AnomalyClass,
  signals: string[],
  tenantId?: string
): AnomalyReasoning {
  const impactScore = clampScore(signals.length * 15)
  const confidence = clampScore(Math.min(signals.length * 25, 90)) / 100
  const reasoning: AnomalyReasoning = {
    reasoningId: crypto.randomUUID(),
    anomalyId,
    tenantId,
    anomalyClass: cls,
    rootCauses: signals.slice(0, 3),
    propagationPath: signals,
    impactScore,
    confidence,
    reasoning: `Anomaly ${cls} detected via ${signals.length} signals with impact ${impactScore}`,
    suggestedActions: ["investigate_root_causes", "apply_mitigation", "monitor_propagation"],
    reasonedAt: new Date().toISOString(),
  }
  REASONINGS.push(reasoning)
  if (REASONINGS.length > REASONINGS_CAP) REASONINGS.splice(0, REASONINGS.length - REASONINGS_CAP)
  return reasoning
}

export function getReasoning(anomalyId: string): AnomalyReasoning | undefined {
  return REASONINGS.find((r) => r.anomalyId === anomalyId)
}

export function getHighImpactAnomalies(): AnomalyReasoning[] {
  return REASONINGS.filter((r) => r.impactScore >= 60)
}

export function getAnomalySummary(): {
  total: number
  byClass: Record<string, number>
  avgImpact: number
  avgConfidence: number
} {
  const total = REASONINGS.length
  const byClass: Record<string, number> = {}
  for (const r of REASONINGS) {
    byClass[r.anomalyClass] = (byClass[r.anomalyClass] ?? 0) + 1
  }
  const avgImpact = total > 0 ? REASONINGS.reduce((s, r) => s + r.impactScore, 0) / total : 0
  const avgConfidence = total > 0 ? REASONINGS.reduce((s, r) => s + r.confidence, 0) / total : 0
  return { total, byClass, avgImpact, avgConfidence }
}
