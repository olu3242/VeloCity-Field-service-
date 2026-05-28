import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface ResilienceScore {
  scoreId: string; orchestrationId: string; tenantId?: string
  retrySuccessRate: number; checkpointCoverage: number; rollbackAvailability: number
  deadlockFrequency: number; overallScore: number
  level: "resilient" | "stable" | "fragile" | "critical"
  scoredAt: string
}

const SCORES: ResilienceScore[] = []
const SCORES_CAP = 500

export function scoreResilience(
  orchestrationId: string,
  metrics: { retrySuccessRate: number; checkpointCoverage: number; rollbackAvailability: number; deadlockFrequency: number },
  tenantId?: string
): ResilienceScore {
  void isRuntimePaused()
  const { retrySuccessRate, checkpointCoverage, rollbackAvailability, deadlockFrequency } = metrics
  const overallScore = clampScore(
    retrySuccessRate * 0.35 + checkpointCoverage * 0.25 + rollbackAvailability * 0.25 + (100 - deadlockFrequency) * 0.15
  )
  const level: ResilienceScore["level"] =
    overallScore >= 80 ? "resilient" :
    overallScore >= 60 ? "stable" :
    overallScore >= 40 ? "fragile" : "critical"

  const score: ResilienceScore = {
    scoreId: crypto.randomUUID(), orchestrationId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    retrySuccessRate, checkpointCoverage, rollbackAvailability, deadlockFrequency,
    overallScore, level, scoredAt: new Date().toISOString(),
  }
  SCORES.push(score)
  if (SCORES.length > SCORES_CAP) SCORES.splice(0, SCORES.length - SCORES_CAP)
  logger.info("resilience-scorer", { orchestrationId, overallScore, level })
  return score
}

export function getScore(orchestrationId: string): ResilienceScore | undefined {
  return [...SCORES].reverse().find(s => s.orchestrationId === orchestrationId)
}

export function getFragileOrchestrations(): ResilienceScore[] {
  return SCORES.filter(s => s.level === "fragile" || s.level === "critical")
}

export function getResilienceSummary(): {
  total: number; resilient: number; stable: number; fragile: number; critical: number; avgScore: number
} {
  const total = SCORES.length
  const resilient = SCORES.filter(s => s.level === "resilient").length
  const stable = SCORES.filter(s => s.level === "stable").length
  const fragile = SCORES.filter(s => s.level === "fragile").length
  const critical = SCORES.filter(s => s.level === "critical").length
  const avgScore = total > 0 ? SCORES.reduce((s, r) => s + r.overallScore, 0) / total : 0
  return { total, resilient, stable, fragile, critical, avgScore }
}
