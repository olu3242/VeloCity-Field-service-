import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type AdaptationTrigger = "high_error_rate" | "latency_spike" | "queue_depth" | "circuit_open" | "capacity_pressure"

export interface RuntimeAdaptation {
  adaptationId: string
  trigger: AdaptationTrigger
  tenantId?: string
  workflowType?: string
  adaptationAction: string
  automaticApply: boolean
  status: "detected" | "applying" | "applied" | "reverted"
  detectedAt: string
  appliedAt?: string
  revertedAt?: string
  effectMeasured?: string
}

const ADAPTATIONS: RuntimeAdaptation[] = []
const ADAPTATION_CAP = 500

export function detectAdaptation(
  trigger: AdaptationTrigger,
  action: string,
  workflowType?: string,
  tenantId?: string,
  automatic = false,
): RuntimeAdaptation {
  if (isRuntimePaused()) throw new Error("Runtime is paused — adaptations blocked")
  if (ADAPTATIONS.length >= ADAPTATION_CAP) ADAPTATIONS.shift()
  const adaptation: RuntimeAdaptation = {
    adaptationId: crypto.randomUUID(),
    trigger,
    tenantId,
    workflowType,
    adaptationAction: action,
    automaticApply: automatic,
    status: "detected",
    detectedAt: new Date().toISOString(),
  }
  ADAPTATIONS.push(adaptation)
  logger.info(`Adaptation detected: ${trigger}`, "runtime-adaptation", {
    metadata: { adaptationId: adaptation.adaptationId, action, automaticApply: automatic },
  })
  return adaptation
}

export function applyAdaptation(adaptationId: string): void {
  const a = ADAPTATIONS.find(a => a.adaptationId === adaptationId)
  if (a) { a.status = "applied"; a.appliedAt = new Date().toISOString() }
}

export function revertAdaptation(adaptationId: string): void {
  const a = ADAPTATIONS.find(a => a.adaptationId === adaptationId)
  if (a) { a.status = "reverted"; a.revertedAt = new Date().toISOString() }
}

export function getActiveAdaptations(tenantId?: string): RuntimeAdaptation[] {
  return ADAPTATIONS.filter(a =>
    (a.status === "detected" || a.status === "applying" || a.status === "applied") &&
    (!tenantId || a.tenantId === tenantId),
  )
}

export function getAdaptationStats(): { total: number; byTrigger: Record<string, number>; byStatus: Record<string, number> } {
  const byTrigger: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const a of ADAPTATIONS) {
    byTrigger[a.trigger] = (byTrigger[a.trigger] ?? 0) + 1
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
  }
  return { total: ADAPTATIONS.length, byTrigger, byStatus }
}
