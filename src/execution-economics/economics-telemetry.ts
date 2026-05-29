import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface EconomicsEvent {
  eventId: string
  entityId: string
  tenantId?: string
  eventType:
    | "cost_recorded"
    | "roi_calculated"
    | "resource_allocated"
    | "waste_detected"
    | "rebalance_triggered"
    | "economics_scored"
  value: number
  unit: "usd" | "pct" | "ms" | "units"
  metadata: Record<string, unknown>
  occurredAt: string
}

const EVENTS: EconomicsEvent[] = []
const ROLLING_CAP = 2000

export function recordEconomicsEvent(
  entityId: string,
  type: EconomicsEvent["eventType"],
  value: number,
  unit: EconomicsEvent["unit"],
  metadata: Record<string, unknown> = {},
  tenantId?: string
): EconomicsEvent {
  if (isRuntimePaused()) {
    logger.warn("recordEconomicsEvent blocked: runtime paused", { entityId })
  }
  const event: EconomicsEvent = {
    eventId: crypto.randomUUID(),
    entityId,
    tenantId,
    eventType: type,
    value,
    unit,
    metadata,
    occurredAt: new Date().toISOString(),
  }
  EVENTS.push(event)
  if (EVENTS.length > ROLLING_CAP) EVENTS.shift()
  return event
}

export function getEventsForEntity(entityId: string): EconomicsEvent[] {
  return EVENTS.filter((e) => e.entityId === entityId)
}

export function getEventsByType(
  type: EconomicsEvent["eventType"]
): EconomicsEvent[] {
  return EVENTS.filter((e) => e.eventType === type)
}

export function getEconomicsTelemetrySummary(): {
  total: number
  byType: Record<string, number>
  totalCostUsd: number
  avgValue: number
} {
  const total = EVENTS.length
  const byType: Record<string, number> = {}
  for (const e of EVENTS) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
  }
  const usdEvents = EVENTS.filter((e) => e.unit === "usd")
  const totalCostUsd = usdEvents.reduce((s, e) => s + e.value, 0)
  const avgValue =
    total > 0 ? EVENTS.reduce((s, e) => s + e.value, 0) / total : 0
  return { total, byType, totalCostUsd, avgValue }
}
