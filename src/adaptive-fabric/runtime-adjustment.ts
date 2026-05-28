import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface RuntimeAdjustment {
  adjustmentId: string
  parameter: string
  scope: "global" | "tenant" | "partition" | "workflow_type"
  targetId?: string
  previousValue: number
  newValue: number
  reason: string
  appliedBy: "automatic" | "operator"
  status: "applied" | "reverted" | "pending"
  appliedAt: string
  revertedAt?: string
}

const ADJUSTMENTS: RuntimeAdjustment[] = []
const CAP = 1000

export function applyAdjustment(
  parameter: string,
  scope: RuntimeAdjustment["scope"],
  prev: number,
  next: number,
  reason: string,
  appliedBy: RuntimeAdjustment["appliedBy"] = "automatic",
  targetId?: string
): RuntimeAdjustment {
  if (isRuntimePaused()) {
    logger.warn("applyAdjustment blocked: runtime paused", "runtime-adjustment")
    throw new Error("Runtime is paused")
  }
  if (ADJUSTMENTS.length >= CAP) ADJUSTMENTS.shift()
  const adjustment: RuntimeAdjustment = {
    adjustmentId: crypto.randomUUID(),
    parameter,
    scope,
    targetId,
    previousValue: prev,
    newValue: next,
    reason,
    appliedBy,
    status: "applied",
    appliedAt: new Date().toISOString(),
  }
  ADJUSTMENTS.push(adjustment)
  logger.info(`Adjustment applied: ${parameter} ${prev}->${next}`, "runtime-adjustment")
  return adjustment
}

export function revertAdjustment(adjustmentId: string): void {
  const a = ADJUSTMENTS.find(x => x.adjustmentId === adjustmentId)
  if (a) { a.status = "reverted"; a.revertedAt = new Date().toISOString() }
}

export function getAdjustmentHistory(parameter?: string): RuntimeAdjustment[] {
  return parameter ? ADJUSTMENTS.filter(a => a.parameter === parameter) : [...ADJUSTMENTS]
}

export function getActiveAdjustments(scope?: RuntimeAdjustment["scope"]): RuntimeAdjustment[] {
  const active = ADJUSTMENTS.filter(a => a.status === "applied")
  return scope ? active.filter(a => a.scope === scope) : active
}

export function getAdjustmentStats(): {
  total: number
  byParameter: Record<string, number>
  byScope: Record<string, number>
  autoCount: number
} {
  const byParameter: Record<string, number> = {}
  const byScope: Record<string, number> = {}
  let autoCount = 0
  for (const a of ADJUSTMENTS) {
    byParameter[a.parameter] = (byParameter[a.parameter] ?? 0) + 1
    byScope[a.scope] = (byScope[a.scope] ?? 0) + 1
    if (a.appliedBy === "automatic") autoCount += 1
  }
  return { total: ADJUSTMENTS.length, byParameter, byScope, autoCount }
}
