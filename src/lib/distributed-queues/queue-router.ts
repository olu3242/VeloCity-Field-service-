export interface QueueRoute {
  eventType: string
  primaryQueueId: string
  fallbackQueueId?: string
  priorityBoost: boolean
  routedAt?: string
}

const ROUTES: Map<string, QueueRoute> = new Map()
const ROUTING_COUNTS: Map<string, number> = new Map()
let totalRouted = 0

function preRegisterRoutes(): void {
  const seeds: QueueRoute[] = [
    { eventType: "payment_failed", primaryQueueId: "primary-us-east", fallbackQueueId: "dlq-global", priorityBoost: true },
    { eventType: "dispute_opened", primaryQueueId: "primary-us-east", priorityBoost: false },
    { eventType: "sla_breach", primaryQueueId: "priority-us-east", priorityBoost: true },
  ]
  for (const s of seeds) {
    ROUTES.set(s.eventType, s)
  }
}
preRegisterRoutes()

export function registerQueueRoute(route: QueueRoute): void {
  ROUTES.set(route.eventType, route)
}

export function resolveQueue(eventType: string): QueueRoute {
  const route = ROUTES.get(eventType)
  if (route) return route
  return { eventType, primaryQueueId: "primary-us-east", priorityBoost: false }
}

export function recordRouting(eventType: string): void {
  const current = ROUTING_COUNTS.get(eventType) ?? 0
  ROUTING_COUNTS.set(eventType, current + 1)
  totalRouted++
}

export function getRoutingStats(): { totalRouted: number; byEventType: Record<string, number> } {
  const byEventType: Record<string, number> = {}
  for (const [k, v] of Array.from(ROUTING_COUNTS.entries())) {
    byEventType[k] = v
  }
  return { totalRouted, byEventType }
}
