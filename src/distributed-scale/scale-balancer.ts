import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ScaleDecision {
  decisionId: string
  subsystem: string
  tenantId?: string
  currentLoad: number
  targetLoad: number
  action: "scale_up" | "scale_out" | "scale_in" | "scale_down" | "maintain"
  magnitude: number
  confidence: number
  reasoning: string
  decidedAt: string
}

const DECISIONS: ScaleDecision[] = []
const ROLLING_CAP = 500

function resolveAction(
  currentLoad: number,
  targetLoad: number
): ScaleDecision["action"] {
  if (currentLoad > targetLoad + 20) return "scale_out"
  if (currentLoad > targetLoad + 5) return "scale_up"
  if (currentLoad < targetLoad - 20) return "scale_in"
  if (currentLoad < targetLoad - 5) return "scale_down"
  return "maintain"
}

export function decideScaling(
  subsystem: string,
  currentLoad: number,
  targetLoad: number,
  confidence: number,
  tenantId?: string
): ScaleDecision {
  if (isRuntimePaused()) {
    logger.warn("decideScaling blocked: runtime paused", { subsystem })
  }
  const action = resolveAction(currentLoad, targetLoad)
  const magnitude = Math.round(Math.abs(currentLoad - targetLoad) / 10)
  const reasoning = `Load ${currentLoad} vs target ${targetLoad}: ${action}`
  const decision: ScaleDecision = {
    decisionId: crypto.randomUUID(),
    subsystem,
    tenantId,
    currentLoad,
    targetLoad,
    action,
    magnitude,
    confidence,
    reasoning,
    decidedAt: new Date().toISOString(),
  }
  DECISIONS.push(decision)
  if (DECISIONS.length > ROLLING_CAP) DECISIONS.shift()
  return decision
}

export function getLatestDecision(subsystem: string): ScaleDecision | undefined {
  for (let i = DECISIONS.length - 1; i >= 0; i--) {
    if (DECISIONS[i].subsystem === subsystem) return DECISIONS[i]
  }
  return undefined
}

export function getScalingHistory(subsystem: string): ScaleDecision[] {
  return DECISIONS.filter((d) => d.subsystem === subsystem)
}

export function getScalingSummary(): {
  total: number
  byAction: Record<string, number>
  avgConfidence: number
  avgMagnitude: number
} {
  const total = DECISIONS.length
  const byAction: Record<string, number> = {}
  for (const d of DECISIONS) {
    byAction[d.action] = (byAction[d.action] ?? 0) + 1
  }
  const avgConfidence =
    total > 0 ? DECISIONS.reduce((s, d) => s + d.confidence, 0) / total : 0
  const avgMagnitude =
    total > 0 ? DECISIONS.reduce((s, d) => s + d.magnitude, 0) / total : 0
  return { total, byAction, avgConfidence, avgMagnitude }
}
