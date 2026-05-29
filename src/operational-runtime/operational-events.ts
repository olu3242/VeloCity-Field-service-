import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type OperationalEventType =
  | "provider_lead_created" | "provider_verified" | "provider_activated" | "provider_quality_degraded"
  | "dispatch_started" | "provider_assigned" | "dispatch_retry_triggered" | "dispatch_escalated"
  | "dispatch_failed" | "dispatch_completed"
  | "payout_pending" | "payout_processed" | "payout_failed" | "refund_processed"
  | "sla_timer_started" | "sla_breach_detected" | "sla_escalation_started"
  | "queue_latency_detected" | "worker_failure_detected" | "anomaly_detected"

export interface OperationalEvent {
  eventId: string
  type: OperationalEventType
  source: string
  entityType?: string
  entityId?: string
  tenantId?: string
  correlationId: string
  payload: Record<string, unknown>
  dedupKey?: string
  emittedAt: string
}

const EVENTS: OperationalEvent[] = []
const EVENTS_CAP = 5000
const DEDUP_WINDOW: Map<string, string> = new Map()
const DEDUP_CAP = 2000
let dedupCount = 0

export function emit(
  type: OperationalEventType,
  source: string,
  payload: Record<string, unknown>,
  entityType?: string,
  entityId?: string,
  tenantId?: string,
  dedupKey?: string,
): OperationalEvent | null {
  if (isRuntimePaused()) {
    logger.warn("emit blocked: runtime paused", "operational-events", { metadata: { type } })
    return null
  }
  if (dedupKey && DEDUP_WINDOW.has(dedupKey)) {
    dedupCount++
    return null
  }
  const event: OperationalEvent = {
    eventId: crypto.randomUUID(),
    type, source, entityType, entityId, tenantId,
    correlationId: crypto.randomUUID(),
    payload, dedupKey,
    emittedAt: new Date().toISOString(),
  }
  if (EVENTS.length >= EVENTS_CAP) EVENTS.shift()
  EVENTS.push(event)
  if (dedupKey) {
    if (DEDUP_WINDOW.size >= DEDUP_CAP) {
      const firstKey = Array.from(DEDUP_WINDOW.keys())[0]
      if (firstKey !== undefined) DEDUP_WINDOW.delete(firstKey)
    }
    DEDUP_WINDOW.set(dedupKey, event.eventId)
  }
  return event
}

export function getEventsByType(type: OperationalEventType): OperationalEvent[] {
  return EVENTS.filter((e) => e.type === type)
}

export function getRecentEvents(limit = 100): OperationalEvent[] {
  return EVENTS.slice(-limit)
}

export function getEventSummary(): {
  total: number
  byType: Record<string, number>
  deduplicated: number
} {
  const byType: Record<string, number> = {}
  for (const e of EVENTS) {
    byType[e.type] = (byType[e.type] ?? 0) + 1
  }
  return { total: EVENTS.length, byType, deduplicated: dedupCount }
}
