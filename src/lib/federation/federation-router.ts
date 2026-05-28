export interface FederationRoute {
  id: string
  sourceNodeId: string
  targetNodeId: string
  routeType: "workflow" | "event" | "data" | "command"
  priority: number
  status: "active" | "suspended" | "failed"
  createdAt: string
}

const ROUTES: FederationRoute[] = []
const CAP = 200

export function createRoute(
  sourceNodeId: string,
  targetNodeId: string,
  routeType: FederationRoute["routeType"],
  priority = 50
): FederationRoute {
  const route: FederationRoute = {
    id: crypto.randomUUID(),
    sourceNodeId,
    targetNodeId,
    routeType,
    priority,
    status: "active",
    createdAt: new Date().toISOString(),
  }
  if (ROUTES.length >= CAP) ROUTES.shift()
  ROUTES.push(route)
  return route
}

export function suspendRoute(id: string): void {
  const route = ROUTES.find(r => r.id === id)
  if (route) route.status = "suspended"
}

export function getActiveRoutes(sourceNodeId?: string): FederationRoute[] {
  const active = ROUTES.filter(r => r.status === "active")
  if (sourceNodeId !== undefined) return active.filter(r => r.sourceNodeId === sourceNodeId)
  return active
}

export function getBestRoute(
  sourceNodeId: string,
  targetNodeId: string,
  routeType: FederationRoute["routeType"]
): FederationRoute | undefined {
  return ROUTES
    .filter(r =>
      r.sourceNodeId === sourceNodeId &&
      r.targetNodeId === targetNodeId &&
      r.routeType === routeType &&
      r.status === "active"
    )
    .sort((a, b) => b.priority - a.priority)[0]
}
