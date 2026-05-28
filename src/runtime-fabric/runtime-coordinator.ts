import { logger } from "@/runtime-core/observability"

export type CoordinationEventType =
  | "sync"
  | "leader_elected"
  | "partition_joined"
  | "partition_left"
  | "failover"
  | "rebalance_complete"

export interface CoordinationEvent {
  eventId: string
  eventType: CoordinationEventType
  sourcePartitionId: string
  targetPartitionId?: string
  tenantId?: string
  payload: Record<string, unknown>
  occurredAt: string
}

const COORDINATION_LOG: CoordinationEvent[] = []
const LOG_CAP = 1000

export function emitCoordinationEvent(
  type: CoordinationEventType,
  sourcePartitionId: string,
  payload: Record<string, unknown>,
  options?: { targetPartitionId?: string; tenantId?: string },
): CoordinationEvent {
  if (COORDINATION_LOG.length >= LOG_CAP) COORDINATION_LOG.shift()
  const event: CoordinationEvent = {
    eventId: crypto.randomUUID(),
    eventType: type,
    sourcePartitionId,
    targetPartitionId: options?.targetPartitionId,
    tenantId: options?.tenantId,
    payload,
    occurredAt: new Date().toISOString(),
  }
  COORDINATION_LOG.push(event)
  logger.info(`Coordination event: ${type}`, "runtime-coordinator", {
    metadata: { eventId: event.eventId, sourcePartitionId, targetPartitionId: options?.targetPartitionId },
  })
  return event
}

export function getRecentEvents(limit = 50): CoordinationEvent[] {
  return COORDINATION_LOG.slice(-Math.min(limit, COORDINATION_LOG.length))
}

export function getEventsByType(type: CoordinationEventType): CoordinationEvent[] {
  return COORDINATION_LOG.filter((e) => e.eventType === type)
}

export function getCoordinationSummary(): {
  total: number
  byType: Record<string, number>
  lastEventAt?: string
} {
  const byType: Record<string, number> = {}
  for (const e of COORDINATION_LOG) byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
  const last = COORDINATION_LOG.at(-1)
  return { total: COORDINATION_LOG.length, byType, lastEventAt: last?.occurredAt }
}
