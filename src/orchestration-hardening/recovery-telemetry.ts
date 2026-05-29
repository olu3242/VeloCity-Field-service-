import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface RecoveryEvent {
  eventId: string; orchestrationId: string; tenantId?: string
  eventType: "checkpoint_created" | "checkpoint_restored" | "rollback_initiated" | "deadlock_resolved" | "timeout_triggered" | "failover_activated"
  durationMs?: number; success: boolean; metadata: Record<string, unknown>
  occurredAt: string
}

const EVENTS: RecoveryEvent[] = []
const EVENTS_CAP = 2000

export function recordRecoveryEvent(
  orchestrationId: string,
  type: RecoveryEvent["eventType"],
  success: boolean,
  durationMs?: number,
  metadata?: Record<string, unknown>,
  tenantId?: string
): RecoveryEvent {
  void isRuntimePaused()
  const event: RecoveryEvent = {
    eventId: crypto.randomUUID(), orchestrationId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    eventType: type,
    ...(durationMs !== undefined ? { durationMs } : {}),
    success,
    metadata: metadata ?? {},
    occurredAt: new Date().toISOString(),
  }
  EVENTS.push(event)
  if (EVENTS.length > EVENTS_CAP) EVENTS.splice(0, EVENTS.length - EVENTS_CAP)
  logger.info("recovery-telemetry", { eventId: event.eventId, orchestrationId, type, success })
  return event
}

export function getEventsForOrchestration(orchestrationId: string): RecoveryEvent[] {
  return EVENTS.filter(e => e.orchestrationId === orchestrationId)
}

export function getEventsByType(type: RecoveryEvent["eventType"]): RecoveryEvent[] {
  return EVENTS.filter(e => e.eventType === type)
}

export function getRecoveryTelemetrySummary(): {
  total: number; byType: Record<string, number>; successRate: number; avgDurationMs: number
} {
  const total = EVENTS.length
  const byType: Record<string, number> = {}
  let successCount = 0
  let durSum = 0
  let durCount = 0
  for (const e of EVENTS) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
    if (e.success) successCount++
    if (e.durationMs !== undefined) { durSum += e.durationMs; durCount++ }
  }
  const successRate = total > 0 ? (successCount / total) * 100 : 0
  const avgDurationMs = durCount > 0 ? durSum / durCount : 0
  return { total, byType, successRate, avgDurationMs }
}
