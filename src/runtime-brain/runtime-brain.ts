import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export type ReasoningDomain =
  | "orchestration"
  | "remediation"
  | "optimization"
  | "deployment"
  | "escalation"
  | "capacity"
  | "federation"
  | "compliance"

export interface BrainState {
  brainId: string
  activeDomain: ReasoningDomain | null
  totalDecisions: number
  totalRecommendations: number
  avgConfidence: number
  lastReasonedAt?: string
  healthScore: number
}

const BRAIN_STATE: BrainState = {
  brainId: crypto.randomUUID(),
  activeDomain: null,
  totalDecisions: 0,
  totalRecommendations: 0,
  avgConfidence: 0,
  healthScore: 100,
}

export function getBrainState(): BrainState {
  return { ...BRAIN_STATE }
}

export function recordDecision(domain: ReasoningDomain, confidence: number): void {
  if (isRuntimePaused()) {
    logger.warn("recordDecision blocked: runtime paused", "runtime-brain")
    return
  }
  const prev = BRAIN_STATE.totalDecisions
  BRAIN_STATE.totalDecisions = prev + 1
  BRAIN_STATE.avgConfidence =
    prev === 0
      ? confidence
      : (BRAIN_STATE.avgConfidence * prev + confidence) / BRAIN_STATE.totalDecisions
  BRAIN_STATE.activeDomain = domain
  BRAIN_STATE.lastReasonedAt = new Date().toISOString()
  BRAIN_STATE.healthScore = getBrainHealthScore()
  logger.info(`Decision recorded: ${domain} confidence=${confidence.toFixed(2)}`, "runtime-brain")
}

export function recordRecommendation(): void {
  if (isRuntimePaused()) {
    logger.warn("recordRecommendation blocked: runtime paused", "runtime-brain")
    return
  }
  BRAIN_STATE.totalRecommendations += 1
}

export function getBrainHealthScore(): number {
  const avg = BRAIN_STATE.avgConfidence
  if (avg > 0.7) return clampScore(100)
  if (avg > 0.5) return clampScore(70)
  return clampScore(40)
}
