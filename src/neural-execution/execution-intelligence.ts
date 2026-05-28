import { logger } from "@/runtime-core/observability"

export interface ExecutionIntelligence {
  intelligenceId: string
  tenantId?: string
  workflowType?: string
  signal: "optimize_routing" | "warn_dependency" | "pattern_detected" | "anomaly_risk" | "capacity_signal"
  description: string
  confidence: number
  actionable: boolean
  recommendedAction?: string
  expiresAt: string
  generatedAt: string
}

const INTELLIGENCE: ExecutionIntelligence[] = []
const INTEL_CAP = 500

export function generateIntelligence(
  signal: ExecutionIntelligence["signal"],
  description: string,
  confidence: number,
  workflowType?: string,
  tenantId?: string,
): ExecutionIntelligence {
  if (INTELLIGENCE.length >= INTEL_CAP) INTELLIGENCE.shift()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  const clamped = Math.max(0, Math.min(1, confidence))
  const intel: ExecutionIntelligence = {
    intelligenceId: crypto.randomUUID(),
    tenantId,
    workflowType,
    signal,
    description,
    confidence: clamped,
    actionable: clamped > 0.7,
    expiresAt,
    generatedAt: now.toISOString(),
  }
  INTELLIGENCE.push(intel)
  logger.info(`Intelligence generated: ${signal}`, "execution-intelligence", {
    metadata: { confidence: clamped, actionable: intel.actionable, workflowType },
  })
  return intel
}

export function getActiveIntelligence(workflowType?: string, tenantId?: string): ExecutionIntelligence[] {
  const now = new Date().toISOString()
  return INTELLIGENCE.filter(i =>
    i.expiresAt > now &&
    (!workflowType || i.workflowType === workflowType) &&
    (!tenantId || i.tenantId === tenantId),
  )
}

export function getIntelligenceSummary(): { total: number; active: number; actionable: number; bySignal: Record<string, number> } {
  const now = new Date().toISOString()
  const bySignal: Record<string, number> = {}
  let active = 0
  let actionable = 0
  for (const i of INTELLIGENCE) {
    bySignal[i.signal] = (bySignal[i.signal] ?? 0) + 1
    if (i.expiresAt > now) active++
    if (i.actionable) actionable++
  }
  return { total: INTELLIGENCE.length, active, actionable, bySignal }
}
