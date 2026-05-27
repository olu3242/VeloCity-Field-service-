/**
 * Stream Router — routes live events to their appropriate destinations.
 * Pre-registers default routes for well-known event types.
 */

export interface StreamRoute {
  eventType: string
  destination: "queue" | "telemetry" | "alert" | "log" | "dead_letter"
  filter?: string
  priority: "low" | "normal" | "high" | "critical"
  active: boolean
}

const ROUTES: Map<string, StreamRoute> = new Map()

const DEFAULT_ROUTES: StreamRoute[] = [
  { eventType: "payment_failed", destination: "queue", priority: "critical", active: true },
  { eventType: "dispute_opened", destination: "queue", priority: "high", active: true },
  { eventType: "agent_run", destination: "telemetry", priority: "normal", active: true },
  { eventType: "sla_breach", destination: "alert", priority: "critical", active: true },
  { eventType: "default", destination: "log", priority: "low", active: true },
]

for (const route of DEFAULT_ROUTES) {
  ROUTES.set(route.eventType, route)
}

export function registerRoute(route: StreamRoute): void {
  ROUTES.set(route.eventType, route)
}

export function routeEvent(eventType: string): StreamRoute {
  const route = ROUTES.get(eventType)
  if (route) return route
  const defaultRoute = ROUTES.get("default")
  if (defaultRoute) return defaultRoute
  return { eventType, destination: "log", priority: "low", active: true }
}

export function getActiveRoutes(): StreamRoute[] {
  return Array.from(ROUTES.values()).filter((r) => r.active)
}
