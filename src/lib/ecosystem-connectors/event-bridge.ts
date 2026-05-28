export interface BridgedEvent {
  id: string
  sourceSystem: string
  targetSystem: string
  eventType: string
  payload: Record<string, unknown>
  status: "pending" | "delivered" | "failed" | "retrying"
  attempts: number
  createdAt: string
  deliveredAt?: string
}

const EVENTS: BridgedEvent[] = []
const CAP = 1000

export function bridgeEvent(
  sourceSystem: string,
  targetSystem: string,
  eventType: string,
  payload: Record<string, unknown>
): BridgedEvent {
  const event: BridgedEvent = {
    id: crypto.randomUUID(),
    sourceSystem,
    targetSystem,
    eventType,
    payload,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
  }
  if (EVENTS.length >= CAP) EVENTS.shift()
  EVENTS.push(event)
  return event
}

export function markDelivered(id: string): void {
  const event = EVENTS.find(e => e.id === id)
  if (event) {
    event.status = "delivered"
    event.deliveredAt = new Date().toISOString()
  }
}

export function markFailed(id: string): void {
  const event = EVENTS.find(e => e.id === id)
  if (event) event.status = "failed"
}

export function scheduleRetry(id: string): void {
  const event = EVENTS.find(e => e.id === id)
  if (event) {
    event.status = "retrying"
    event.attempts++
  }
}

export function getPendingEvents(targetSystem?: string): BridgedEvent[] {
  const pending = EVENTS.filter(e => e.status === "pending" || e.status === "retrying")
  if (targetSystem !== undefined) return pending.filter(e => e.targetSystem === targetSystem)
  return pending
}

export function getBridgeStats(): {
  total: number
  delivered: number
  failed: number
  pending: number
  successRate: number
} {
  const delivered = EVENTS.filter(e => e.status === "delivered").length
  const failed = EVENTS.filter(e => e.status === "failed").length
  const pending = EVENTS.filter(e => e.status === "pending" || e.status === "retrying").length
  const total = EVENTS.length
  return {
    total,
    delivered,
    failed,
    pending,
    successRate: total > 0 ? delivered / total : 0,
  }
}
