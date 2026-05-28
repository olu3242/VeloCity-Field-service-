import { logger } from "@/runtime-core/observability"

export interface WorkflowPattern {
  patternId: string
  patternSignature: string
  workflowType: string
  tenantId?: string
  occurrences: number
  avgDurationMs: number
  successRate: number
  learned: boolean
  firstSeenAt: string
  lastSeenAt: string
}

const PATTERNS: Map<string, WorkflowPattern> = new Map()
const PATTERN_CAP = 1000

export function recordPattern(
  signature: string,
  workflowType: string,
  durationMs: number,
  success: boolean,
  tenantId?: string,
): WorkflowPattern {
  const existing = PATTERNS.get(signature)
  if (existing) {
    const n = existing.occurrences
    existing.avgDurationMs = (existing.avgDurationMs * n + durationMs) / (n + 1)
    existing.successRate = (existing.successRate * n + (success ? 1 : 0)) / (n + 1)
    existing.occurrences += 1
    existing.lastSeenAt = new Date().toISOString()
    if (existing.occurrences >= 5) existing.learned = true
    return existing
  }
  if (PATTERNS.size >= PATTERN_CAP) {
    const firstKey = Array.from(PATTERNS.keys())[0]
    PATTERNS.delete(firstKey)
  }
  const pattern: WorkflowPattern = {
    patternId: crypto.randomUUID(),
    patternSignature: signature,
    workflowType,
    tenantId,
    occurrences: 1,
    avgDurationMs: durationMs,
    successRate: success ? 1 : 0,
    learned: false,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  }
  PATTERNS.set(signature, pattern)
  logger.info(`Pattern recorded: ${signature}`, "workflow-pattern-graph", { metadata: { workflowType } })
  return pattern
}

export function getLearnedPatterns(workflowType?: string): WorkflowPattern[] {
  return Array.from(PATTERNS.values()).filter(p => p.learned && (!workflowType || p.workflowType === workflowType))
}

export function getBestPattern(workflowType: string): WorkflowPattern | undefined {
  const candidates = Array.from(PATTERNS.values()).filter(p => p.workflowType === workflowType)
  if (candidates.length === 0) return undefined
  return candidates.reduce((best, p) => {
    const score = p.successRate * p.occurrences
    const bestScore = best.successRate * best.occurrences
    return score > bestScore ? p : best
  })
}

export function getPatternStats(): { total: number; learned: number; avgSuccessRate: number; topWorkflowType: string | undefined } {
  const values = Array.from(PATTERNS.values())
  const avgSuccessRate = values.length > 0 ? values.reduce((s, p) => s + p.successRate, 0) / values.length : 0
  const typeCounts = new Map<string, number>()
  for (const p of values) typeCounts.set(p.workflowType, (typeCounts.get(p.workflowType) ?? 0) + 1)
  let topWorkflowType: string | undefined
  let topCount = 0
  for (const [wt, count] of Array.from(typeCounts.entries())) {
    if (count > topCount) { topCount = count; topWorkflowType = wt }
  }
  return { total: PATTERNS.size, learned: values.filter(p => p.learned).length, avgSuccessRate, topWorkflowType }
}
