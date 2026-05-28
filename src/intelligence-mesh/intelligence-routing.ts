import { logger } from "@/runtime-core/observability"

export type IntelligenceSignal = "pattern" | "anomaly" | "optimization" | "risk" | "recovery" | "forecast"

export interface IntelligenceRoute {
  routeId: string
  signal: IntelligenceSignal
  sourceNodeId: string
  payload: Record<string, unknown>
  priority: "low" | "normal" | "high" | "critical"
  tenantId?: string
  status: "queued" | "delivered" | "expired"
  enqueuedAt: string
  deliveredAt?: string
  expiresAt: string
}

const ROUTES: IntelligenceRoute[] = []
const MAX_ROUTES = 2000

const EXPIRY_MINUTES: Record<string, number> = {
  low: 5,
  normal: 10,
  high: 30,
  critical: 60,
}

export function routeIntelligence(
  signal: IntelligenceSignal,
  sourceNodeId: string,
  payload: Record<string, unknown>,
  priority: "low" | "normal" | "high" | "critical" = "normal",
  tenantId?: string,
): IntelligenceRoute {
  const now = new Date()
  const expiryMs = (EXPIRY_MINUTES[priority] ?? 10) * 60_000
  const expiresAt = new Date(now.getTime() + expiryMs).toISOString()

  const route: IntelligenceRoute = {
    routeId: crypto.randomUUID(),
    signal,
    sourceNodeId,
    payload,
    priority,
    tenantId,
    status: "queued",
    enqueuedAt: now.toISOString(),
    expiresAt,
  }

  if (ROUTES.length >= MAX_ROUTES) ROUTES.shift()
  ROUTES.push(route)
  logger.info(`Intelligence routed: ${signal}`, "intelligence-routing", {
    tenantId, metadata: { signal, priority, routeId: route.routeId },
  })
  return route
}

export function markDelivered(routeId: string): void {
  const route = ROUTES.find((r) => r.routeId === routeId)
  if (route) { route.status = "delivered"; route.deliveredAt = new Date().toISOString() }
}

export function expireStale(): number {
  const now = new Date().toISOString()
  let count = 0
  for (const route of ROUTES) {
    if (route.status === "queued" && route.expiresAt <= now) {
      route.status = "expired"
      count += 1
    }
  }
  return count
}

export function getPendingRoutes(signal?: IntelligenceSignal): IntelligenceRoute[] {
  return ROUTES.filter(
    (r) => r.status === "queued" && (signal === undefined || r.signal === signal),
  )
}

export function getRoutingStats(): {
  total: number
  queued: number
  delivered: number
  expired: number
  bySignal: Record<string, number>
} {
  const bySignal: Record<string, number> = {}
  let queued = 0, delivered = 0, expired = 0
  for (const r of ROUTES) {
    bySignal[r.signal] = (bySignal[r.signal] ?? 0) + 1
    if (r.status === "queued") queued++
    else if (r.status === "delivered") delivered++
    else expired++
  }
  return { total: ROUTES.length, queued, delivered, expired, bySignal }
}
