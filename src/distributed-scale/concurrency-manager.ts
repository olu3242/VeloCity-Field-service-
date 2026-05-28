import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface ConcurrencySlot {
  slotId: string
  operationType: string
  tenantId?: string
  maxConcurrency: number
  activeConcurrency: number
  queuedCount: number
  utilizationPct: number
  throttled: boolean
  lastUpdatedAt: string
}

const SLOTS = new Map<string, ConcurrencySlot>()
const CAP = 500

export function registerConcurrencyLimit(
  operationType: string,
  maxConcurrency: number,
  tenantId?: string
): ConcurrencySlot {
  if (isRuntimePaused()) {
    logger.warn("registerConcurrencyLimit blocked: runtime paused", {
      operationType,
    })
    throw new Error("Runtime is paused")
  }
  if (SLOTS.size >= CAP && !SLOTS.has(operationType)) {
    const firstKey = Array.from(SLOTS.keys())[0]
    SLOTS.delete(firstKey)
  }
  const slot: ConcurrencySlot = {
    slotId: crypto.randomUUID(),
    operationType,
    tenantId,
    maxConcurrency,
    activeConcurrency: 0,
    queuedCount: 0,
    utilizationPct: 0,
    throttled: false,
    lastUpdatedAt: new Date().toISOString(),
  }
  SLOTS.set(operationType, slot)
  return slot
}

export function acquire(operationType: string): boolean {
  const slot = SLOTS.get(operationType)
  if (!slot) return false
  if (slot.activeConcurrency < slot.maxConcurrency) {
    slot.activeConcurrency++
    slot.utilizationPct = clampScore(
      (slot.activeConcurrency / Math.max(1, slot.maxConcurrency)) * 100
    )
    slot.throttled = slot.utilizationPct >= 90
    slot.lastUpdatedAt = new Date().toISOString()
    return true
  }
  slot.queuedCount++
  slot.lastUpdatedAt = new Date().toISOString()
  return false
}

export function release(operationType: string): void {
  const slot = SLOTS.get(operationType)
  if (!slot) return
  if (slot.activeConcurrency > 0) slot.activeConcurrency--
  slot.utilizationPct = clampScore(
    (slot.activeConcurrency / Math.max(1, slot.maxConcurrency)) * 100
  )
  slot.throttled = slot.utilizationPct >= 90
  slot.lastUpdatedAt = new Date().toISOString()
}

export function getSlot(operationType: string): ConcurrencySlot | undefined {
  return SLOTS.get(operationType)
}

export function getThrottledOperations(): ConcurrencySlot[] {
  return Array.from(SLOTS.values()).filter((s) => s.throttled)
}

export function getConcurrencySummary(): {
  total: number
  throttled: number
  avgUtilization: number
  totalActive: number
} {
  const values = Array.from(SLOTS.values())
  const total = values.length
  const throttled = values.filter((s) => s.throttled).length
  const avgUtilization =
    total > 0 ? values.reduce((s, v) => s + v.utilizationPct, 0) / total : 0
  const totalActive = values.reduce((s, v) => s + v.activeConcurrency, 0)
  return { total, throttled, avgUtilization, totalActive }
}
