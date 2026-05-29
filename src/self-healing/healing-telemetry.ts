import { logger } from "@/runtime-core/observability"

export interface HealingEvent {
  eventId: string
  orchestrationId: string
  tenantId?: string
  eventType:
    | "recovery_initiated"
    | "retry_scheduled"
    | "circuit_opened"
    | "circuit_closed"
    | "workflow_healed"
    | "correction_converged"
    | "tuning_applied"
  durationMs?: number
  success: boolean
  metadata: Record<string, unknown>
  occurredAt: string
}

const EVENTS: HealingEvent[] = []
const EVENTS_CAP = 2000

export function recordHealingEvent(
  orchestrationId: string,
  eventType: HealingEvent["eventType"],
  success: boolean,
  durationMs?: number,
  metadata: Record<string, unknown> = {},
  tenantId?: string
): HealingEvent {
  const event: HealingEvent = {
    eventId: crypto.randomUUID(),
    orchestrationId,
    tenantId,
    eventType,
    durationMs,
    success,
    metadata,
    occurredAt: new Date().toISOString(),
  }
  EVENTS.push(event)
  if (EVENTS.length > EVENTS_CAP) EVENTS.splice(0, EVENTS.length - EVENTS_CAP)
  logger.info(`HealingEvent: ${eventType} success=${success}`)
  return event
}

export function getEventsForOrchestration(orchestrationId: string): HealingEvent[] {
  return EVENTS.filter((e) => e.orchestrationId === orchestrationId)
}

export function getHealingTelemetrySummary(): {
  total: number
  byType: Record<string, number>
  successRate: number
  recentEvents: HealingEvent[]
} {
  const total = EVENTS.length
  const byType: Record<string, number> = {}
  for (const e of EVENTS) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
  }
  const successRate = total > 0 ? EVENTS.filter((e) => e.success).length / total : 0
  const recentEvents = EVENTS.slice(-10)
  return { total, byType, successRate, recentEvents }
}
