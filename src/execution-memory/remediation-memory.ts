import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface RemediationMemory {
  remediationId: string
  tenantId?: string
  correlationId: string
  failurePattern: string
  actionTaken: string
  actionParams: Record<string, unknown>
  outcome: "resolved" | "partial" | "failed" | "escalated"
  timeToResolutionMs?: number
  confidence: number
  appliedAt: string
}

const REMEDIATION_MEMORY: RemediationMemory[] = []
const CAP = 500

export function recordRemediation(
  failurePattern: string,
  actionTaken: string,
  actionParams: Record<string, unknown>,
  outcome: RemediationMemory["outcome"],
  options?: {
    tenantId?: string
    correlationId?: string
    timeToResolutionMs?: number
    confidence?: number
  }
): RemediationMemory {
  if (isRuntimePaused()) {
    logger.warn("recordRemediation blocked — runtime paused", "remediation-memory", {
      metadata: { failurePattern },
    })
    throw new Error("Runtime is paused")
  }
  if (REMEDIATION_MEMORY.length >= CAP) REMEDIATION_MEMORY.shift()
  const record: RemediationMemory = {
    remediationId: crypto.randomUUID(),
    tenantId: options?.tenantId,
    correlationId: options?.correlationId ?? crypto.randomUUID(),
    failurePattern,
    actionTaken,
    actionParams,
    outcome,
    timeToResolutionMs: options?.timeToResolutionMs,
    confidence: clampScore(options?.confidence ?? 0.5),
    appliedAt: new Date().toISOString(),
  }
  REMEDIATION_MEMORY.push(record)
  return record
}

export function findBestRemediation(failurePattern: string): RemediationMemory | undefined {
  const matches = REMEDIATION_MEMORY.filter((r) => r.failurePattern === failurePattern)
  if (matches.length === 0) return undefined
  return matches.reduce((best, r) => (r.confidence > best.confidence ? r : best), matches[0])
}

export function getRemediationsByOutcome(outcome: RemediationMemory["outcome"]): RemediationMemory[] {
  return REMEDIATION_MEMORY.filter((r) => r.outcome === outcome)
}

export function getRemediationSummary(): {
  total: number
  byOutcome: Record<string, number>
  topPatterns: string[]
} {
  const byOutcome: Record<string, number> = {}
  const patternCounts = new Map<string, number>()
  for (const r of REMEDIATION_MEMORY) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1
    patternCounts.set(r.failurePattern, (patternCounts.get(r.failurePattern) ?? 0) + 1)
  }
  const topPatterns = Array.from(patternCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern]) => pattern)
  return { total: REMEDIATION_MEMORY.length, byOutcome, topPatterns }
}
