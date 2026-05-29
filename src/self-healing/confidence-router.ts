import { logger } from "@/runtime-core/observability"

export interface RoutingDecision {
  decisionId: string
  requestId: string
  tenantId?: string
  candidateRoutes: { routeId: string; confidence: number; latencyMs: number }[]
  selectedRoute: string
  selectionReason: string
  fallbackUsed: boolean
  decidedAt: string
}

const DECISIONS: RoutingDecision[] = []
const DECISIONS_CAP = 1000

export function routeWithConfidence(
  requestId: string,
  routes: { routeId: string; confidence: number; latencyMs: number }[],
  tenantId?: string
): RoutingDecision {
  if (routes.length === 0) {
    logger.warn("routeWithConfidence called with empty routes")
    throw new Error("No candidate routes provided")
  }

  let selectedRoute: string
  let selectionReason: string
  let fallbackUsed: boolean

  const best = routes.reduce((prev, curr) => (curr.confidence > prev.confidence ? curr : prev))

  if (best.confidence > 0.65) {
    selectedRoute = best.routeId
    selectionReason = "highest_confidence"
    fallbackUsed = false
  } else {
    const lowest = routes.reduce((prev, curr) => (curr.latencyMs < prev.latencyMs ? curr : prev))
    selectedRoute = lowest.routeId
    selectionReason = "lowest_latency_fallback"
    fallbackUsed = true
  }

  const decision: RoutingDecision = {
    decisionId: crypto.randomUUID(),
    requestId,
    tenantId,
    candidateRoutes: routes,
    selectedRoute,
    selectionReason,
    fallbackUsed,
    decidedAt: new Date().toISOString(),
  }
  DECISIONS.push(decision)
  if (DECISIONS.length > DECISIONS_CAP) DECISIONS.splice(0, DECISIONS.length - DECISIONS_CAP)
  return decision
}

export function getRecentDecisions(limit = 10): RoutingDecision[] {
  return DECISIONS.slice(-limit)
}

export function getFallbackRate(): number {
  if (DECISIONS.length === 0) return 0
  return DECISIONS.filter((d) => d.fallbackUsed).length / DECISIONS.length
}

export function getRoutingDecisionSummary(): {
  total: number
  fallbackUsed: number
  fallbackRate: number
  avgConfidence: number
} {
  const total = DECISIONS.length
  const fallbackUsed = DECISIONS.filter((d) => d.fallbackUsed).length
  const fallbackRate = total > 0 ? fallbackUsed / total : 0
  const avgConfidence =
    total > 0
      ? DECISIONS.reduce((s, d) => {
          const best = d.candidateRoutes.reduce((p, c) => (c.confidence > p.confidence ? c : p), {
            confidence: 0,
            routeId: "",
            latencyMs: 0,
          })
          return s + best.confidence
        }, 0) / total
      : 0
  return { total, fallbackUsed, fallbackRate, avgConfidence }
}
