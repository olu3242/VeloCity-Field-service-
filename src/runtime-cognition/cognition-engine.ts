import { logger } from "@/runtime-core/observability"
import { buildScore, clampScore } from "@/runtime-core/scoring"

export type CognitionDomain =
  | "orchestration" | "remediation" | "deployment" | "escalation"
  | "optimization" | "federation" | "capacity" | "security"

export interface CognitionState {
  engineId: string
  activeDomains: CognitionDomain[]
  totalReasoningCycles: number
  totalDecisions: number
  avgDecisionConfidence: number
  lastCycleAt?: string
  healthScore: number
}

const COGNITION_STATE: CognitionState = {
  engineId: crypto.randomUUID(),
  activeDomains: [],
  totalReasoningCycles: 0,
  totalDecisions: 0,
  avgDecisionConfidence: 0,
  healthScore: 100,
}

export function getCognitionState(): CognitionState {
  return { ...COGNITION_STATE, activeDomains: [...COGNITION_STATE.activeDomains] }
}

export function beginReasoningCycle(domain: CognitionDomain): void {
  COGNITION_STATE.totalReasoningCycles += 1
  if (!COGNITION_STATE.activeDomains.includes(domain)) {
    COGNITION_STATE.activeDomains.push(domain)
  }
  COGNITION_STATE.lastCycleAt = new Date().toISOString()
  COGNITION_STATE.healthScore = getCognitionHealth()
  logger.debug(`Reasoning cycle begun for domain: ${domain}`, "cognition-engine", {
    metadata: { domain, totalCycles: COGNITION_STATE.totalReasoningCycles },
  })
}

export function recordDecision(domain: CognitionDomain, confidence: number): void {
  const prev = COGNITION_STATE.totalDecisions
  COGNITION_STATE.totalDecisions += 1
  COGNITION_STATE.avgDecisionConfidence =
    (COGNITION_STATE.avgDecisionConfidence * prev + confidence) / COGNITION_STATE.totalDecisions
  COGNITION_STATE.lastCycleAt = new Date().toISOString()
  COGNITION_STATE.healthScore = getCognitionHealth()
  logger.info(`Decision recorded for domain: ${domain}`, "cognition-engine", {
    metadata: { domain, confidence, totalDecisions: COGNITION_STATE.totalDecisions },
  })
}

export function getCognitionHealth(): number {
  const avg = COGNITION_STATE.avgDecisionConfidence
  const raw = avg > 0.75 ? 100 : avg > 0.5 ? 70 : 40
  const score = buildScore(raw, "health", { confidence: avg || 0.5 })
  return clampScore(score.value)
}
