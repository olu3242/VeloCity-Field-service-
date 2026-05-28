import { clampScore } from "@/runtime-core/scoring"

export type RemediationApproach =
  | "immediate"
  | "scheduled"
  | "preventive"
  | "compensating"
  | "escalate"

export interface SynthesizedRemediation {
  synthesisId: string
  incidentId: string
  tenantId?: string
  approach: RemediationApproach
  steps: string[]
  estimatedImpact: number
  confidence: number
  prerequisites: string[]
  risks: string[]
  synthesizedAt: string
}

const SYNTHESES: SynthesizedRemediation[] = []
const SYNTHESES_CAP = 500

export function synthesizeRemediation(
  incidentId: string,
  signals: string[],
  approach: RemediationApproach,
  tenantId?: string
): SynthesizedRemediation {
  const estimatedImpact = clampScore(signals.length * 12)
  const confidence =
    approach === "immediate" ? 0.75 : approach === "preventive" ? 0.9 : 0.8
  const prerequisites: string[] = approach === "immediate" ? ["governance_approval"] : []
  const risks: string[] = estimatedImpact > 60 ? ["high_blast_radius"] : []

  const synthesis: SynthesizedRemediation = {
    synthesisId: crypto.randomUUID(),
    incidentId,
    tenantId,
    approach,
    steps: [
      "assess_impact",
      "isolate_component",
      "apply_fix",
      "validate_recovery",
      "close_incident",
    ],
    estimatedImpact,
    confidence,
    prerequisites,
    risks,
    synthesizedAt: new Date().toISOString(),
  }
  SYNTHESES.push(synthesis)
  if (SYNTHESES.length > SYNTHESES_CAP) SYNTHESES.splice(0, SYNTHESES.length - SYNTHESES_CAP)
  return synthesis
}

export function getSynthesis(incidentId: string): SynthesizedRemediation | undefined {
  return SYNTHESES.find((s) => s.incidentId === incidentId)
}

export function getSynthesisByApproach(approach: RemediationApproach): SynthesizedRemediation[] {
  return SYNTHESES.filter((s) => s.approach === approach)
}

export function getSynthesisSummary(): {
  total: number
  byApproach: Record<string, number>
  avgConfidence: number
  avgImpact: number
} {
  const total = SYNTHESES.length
  const byApproach: Record<string, number> = {}
  for (const s of SYNTHESES) {
    byApproach[s.approach] = (byApproach[s.approach] ?? 0) + 1
  }
  const avgConfidence = total > 0 ? SYNTHESES.reduce((s, r) => s + r.confidence, 0) / total : 0
  const avgImpact = total > 0 ? SYNTHESES.reduce((s, r) => s + r.estimatedImpact, 0) / total : 0
  return { total, byApproach, avgConfidence, avgImpact }
}
