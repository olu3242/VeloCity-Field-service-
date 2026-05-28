import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface AIDecisionRecord {
  decisionId: string
  tenantId?: string
  correlationId: string
  workflowId?: string
  agentName: string
  decisionType: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  confidence: number
  reasoning?: string
  outcome?: "correct" | "incorrect" | "unknown"
  decidedAt: string
  evaluatedAt?: string
}

const DECISIONS: AIDecisionRecord[] = []
const CAP = 1000

export function recordDecision(
  agentName: string,
  decisionType: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  confidence: number,
  options?: {
    tenantId?: string
    correlationId?: string
    workflowId?: string
    reasoning?: string
  }
): AIDecisionRecord {
  if (isRuntimePaused()) {
    logger.warn("recordDecision blocked — runtime paused", "ai-decision-lineage", {
      metadata: { agentName },
    })
    throw new Error("Runtime is paused")
  }
  if (DECISIONS.length >= CAP) DECISIONS.shift()
  const record: AIDecisionRecord = {
    decisionId: crypto.randomUUID(),
    tenantId: options?.tenantId,
    correlationId: options?.correlationId ?? crypto.randomUUID(),
    workflowId: options?.workflowId,
    agentName,
    decisionType,
    input,
    output,
    confidence: clampScore(confidence),
    reasoning: options?.reasoning,
    outcome: undefined,
    decidedAt: new Date().toISOString(),
  }
  DECISIONS.push(record)
  return record
}

export function evaluateDecision(decisionId: string, outcome: NonNullable<AIDecisionRecord["outcome"]>): void {
  const record = DECISIONS.find((d) => d.decisionId === decisionId)
  if (!record) return
  record.outcome = outcome
  record.evaluatedAt = new Date().toISOString()
}

export function getDecisionsByAgent(agentName: string, limit = 100): AIDecisionRecord[] {
  return DECISIONS.filter((d) => d.agentName === agentName).slice(-limit)
}

export function getDecisionsByType(decisionType: string): AIDecisionRecord[] {
  return DECISIONS.filter((d) => d.decisionType === decisionType)
}

export function getLineageSummary(): {
  total: number
  byType: Record<string, number>
  avgConfidence: number
  outcomeRates: { correct: number; incorrect: number; unknown: number }
} {
  const byType: Record<string, number> = {}
  let totalConf = 0
  let correct = 0; let incorrect = 0; let unknown = 0
  for (const d of DECISIONS) {
    byType[d.decisionType] = (byType[d.decisionType] ?? 0) + 1
    totalConf += d.confidence
    if (d.outcome === "correct") correct++
    else if (d.outcome === "incorrect") incorrect++
    else unknown++
  }
  return {
    total: DECISIONS.length,
    byType,
    avgConfidence: DECISIONS.length > 0 ? totalConf / DECISIONS.length : 0,
    outcomeRates: { correct, incorrect, unknown },
  }
}
