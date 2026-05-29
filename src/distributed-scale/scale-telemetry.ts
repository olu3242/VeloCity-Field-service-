import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ScaleTelemetryEvent {
  eventId: string
  subsystem: string
  tenantId?: string
  eventType:
    | "scale_triggered"
    | "partition_created"
    | "shard_registered"
    | "backpressure_activated"
    | "concurrency_throttled"
    | "async_task_queued"
  currentScale: number
  targetScale?: number
  metadata: Record<string, unknown>
  occurredAt: string
}

const EVENTS: ScaleTelemetryEvent[] = []
const ROLLING_CAP = 2000

export function recordScaleEvent(
  subsystem: string,
  type: ScaleTelemetryEvent["eventType"],
  currentScale: number,
  targetScale?: number,
  metadata: Record<string, unknown> = {},
  tenantId?: string
): ScaleTelemetryEvent {
  if (isRuntimePaused()) {
    logger.warn("recordScaleEvent blocked: runtime paused", { subsystem })
  }
  const event: ScaleTelemetryEvent = {
    eventId: crypto.randomUUID(),
    subsystem,
    tenantId,
    eventType: type,
    currentScale,
    targetScale,
    metadata,
    occurredAt: new Date().toISOString(),
  }
  EVENTS.push(event)
  if (EVENTS.length > ROLLING_CAP) EVENTS.shift()
  return event
}

export function getEventsForSubsystem(subsystem: string): ScaleTelemetryEvent[] {
  return EVENTS.filter((e) => e.subsystem === subsystem)
}

export function getScaleEventsByType(
  type: ScaleTelemetryEvent["eventType"]
): ScaleTelemetryEvent[] {
  return EVENTS.filter((e) => e.eventType === type)
}

export function getScaleTelemetrySummary(): {
  total: number
  byType: Record<string, number>
  bySubsystem: Record<string, number>
  recentEvents: ScaleTelemetryEvent[]
} {
  const total = EVENTS.length
  const byType: Record<string, number> = {}
  const bySubsystem: Record<string, number> = {}
  for (const e of EVENTS) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
    bySubsystem[e.subsystem] = (bySubsystem[e.subsystem] ?? 0) + 1
  }
  const recentEvents = EVENTS.slice(-10)
  return { total, byType, bySubsystem, recentEvents }
}
