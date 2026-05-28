import { logger } from "@/runtime-core/observability"
import type { CognitionDomain } from "./cognition-engine"

export interface ReasoningOutput {
  reasoningId: string
  domain: CognitionDomain
  tenantId?: string
  input: Record<string, unknown>
  conclusion: string
  confidence: number
  supportingSignals: string[]
  contradictingSignals: string[]
  recommendation: string
  actionRequired: boolean
  lineageId?: string
  reasonedAt: string
}

const REASONING_LOG: ReasoningOutput[] = []
const MAX_REASONING = 1000

function computeConfidence(signalCount: number): number {
  if (signalCount >= 3) return 0.85
  if (signalCount >= 2) return 0.72
  if (signalCount >= 1) return 0.60
  return 0.40
}

export function reason(
  domain: CognitionDomain,
  input: Record<string, unknown>,
  signals: string[],
  tenantId?: string,
  lineageId?: string,
): ReasoningOutput {
  const confidence = computeConfidence(signals.length)
  const actionRequired = confidence > 0.65
  const conclusion = `${domain} analysis: ${signals.length} signals processed`
  const recommendation = actionRequired ? `Take action on ${domain}` : `Monitor ${domain}`

  const output: ReasoningOutput = {
    reasoningId: crypto.randomUUID(),
    domain,
    tenantId,
    input,
    conclusion,
    confidence,
    supportingSignals: [...signals],
    contradictingSignals: [],
    recommendation,
    actionRequired,
    lineageId,
    reasonedAt: new Date().toISOString(),
  }

  if (REASONING_LOG.length >= MAX_REASONING) REASONING_LOG.shift()
  REASONING_LOG.push(output)
  logger.info(conclusion, "runtime-reasoning", { tenantId, metadata: { domain, confidence } })
  return output
}

export function getReasoningChain(lineageId: string): ReasoningOutput[] {
  return REASONING_LOG.filter((r) => r.lineageId === lineageId)
}

export function getReasoningByDomain(domain: CognitionDomain, limit = 50): ReasoningOutput[] {
  return REASONING_LOG.filter((r) => r.domain === domain).slice(-limit)
}

export function getReasoningSummary(): {
  total: number
  byDomain: Record<string, number>
  avgConfidence: number
  actionRequired: number
} {
  const byDomain: Record<string, number> = {}
  let totalConf = 0
  let actionRequired = 0
  for (const r of REASONING_LOG) {
    byDomain[r.domain] = (byDomain[r.domain] ?? 0) + 1
    totalConf += r.confidence
    if (r.actionRequired) actionRequired += 1
  }
  const total = REASONING_LOG.length
  return { total, byDomain, avgConfidence: total > 0 ? totalConf / total : 0, actionRequired }
}
