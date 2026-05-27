/**
 * Event Stream — rolling in-memory live event buffer.
 * Cap of 1000 entries with rolling eviction.
 */

const STREAM_CAP = 1000

export interface LiveEvent {
  id: string
  eventType: string
  tenantId?: string
  source: string
  payload: Record<string, unknown>
  priority: "low" | "normal" | "high" | "critical"
  emittedAt: string
  processedAt?: string
}

const STREAM: LiveEvent[] = []

function enforceCap(): void {
  while (STREAM.length > STREAM_CAP) STREAM.shift()
}

export function emitLiveEvent(
  eventType: string,
  source: string,
  payload: Record<string, unknown>,
  priority: LiveEvent["priority"] = "normal",
  tenantId?: string
): LiveEvent {
  const event: LiveEvent = {
    id: crypto.randomUUID(),
    eventType,
    tenantId,
    source,
    payload,
    priority,
    emittedAt: new Date().toISOString(),
  }
  STREAM.push(event)
  enforceCap()
  return event
}

export function markProcessed(id: string): void {
  const event = STREAM.find((e) => e.id === id)
  if (event) event.processedAt = new Date().toISOString()
}

export function getStreamByType(eventType: string, limit = 50): LiveEvent[] {
  return STREAM.filter((e) => e.eventType === eventType).slice(-limit)
}

export function getStreamByTenant(tenantId: string, limit = 50): LiveEvent[] {
  return STREAM.filter((e) => e.tenantId === tenantId).slice(-limit)
}

export function getUnprocessedEvents(priority?: LiveEvent["priority"]): LiveEvent[] {
  const unprocessed = STREAM.filter((e) => e.processedAt === undefined)
  if (priority) return unprocessed.filter((e) => e.priority === priority)
  return unprocessed
}

export function getStreamStats(): {
  total: number
  processed: number
  pending: number
  byPriority: Record<string, number>
} {
  const processed = STREAM.filter((e) => e.processedAt !== undefined).length
  const byPriority: Record<string, number> = { low: 0, normal: 0, high: 0, critical: 0 }
  for (const e of STREAM) {
    byPriority[e.priority] = (byPriority[e.priority] ?? 0) + 1
  }
  return { total: STREAM.length, processed, pending: STREAM.length - processed, byPriority }
}
