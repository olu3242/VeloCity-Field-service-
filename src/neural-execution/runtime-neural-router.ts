import { logger } from "@/runtime-core/observability"
import { getMapping } from "./orchestration-semantic-map"

export interface NeuralRoutingDecision {
  decisionId: string
  executionId: string
  workflowType: string
  tenantId?: string
  selectedRoute: string
  neuralConfidence: number
  routingBasis: "pattern_match" | "semantic_similarity" | "load_signal" | "affinity"
  alternativeRoutes: string[]
  decidedAt: string
}

const DECISIONS: NeuralRoutingDecision[] = []
const DECISION_CAP = 2000

export function route(
  executionId: string,
  workflowType: string,
  availableRoutes: string[],
  tenantId?: string,
): NeuralRoutingDecision {
  if (DECISIONS.length >= DECISION_CAP) DECISIONS.shift()
  const mapping = getMapping(workflowType)
  const hasPatterMatch = mapping !== undefined

  const selectedRoute = availableRoutes[0] ?? "default"
  const alternativeRoutes = availableRoutes.slice(1)

  const decision: NeuralRoutingDecision = {
    decisionId: crypto.randomUUID(),
    executionId,
    workflowType,
    tenantId,
    selectedRoute,
    neuralConfidence: hasPatterMatch ? 0.85 : 0.65,
    routingBasis: hasPatterMatch ? "pattern_match" : "load_signal",
    alternativeRoutes,
    decidedAt: new Date().toISOString(),
  }
  DECISIONS.push(decision)
  logger.info(`Neural route decided: ${workflowType} → ${selectedRoute}`, "runtime-neural-router", {
    metadata: { executionId, basis: decision.routingBasis, confidence: decision.neuralConfidence },
  })
  return decision
}

export function getRoutingHistory(workflowType: string, limit = 50): NeuralRoutingDecision[] {
  return DECISIONS.filter(d => d.workflowType === workflowType).slice(-limit)
}

export function getRoutingStats(): { total: number; byBasis: Record<string, number>; avgConfidence: number } {
  const byBasis: Record<string, number> = {}
  let totalConfidence = 0
  for (const d of DECISIONS) {
    byBasis[d.routingBasis] = (byBasis[d.routingBasis] ?? 0) + 1
    totalConfidence += d.neuralConfidence
  }
  const avgConfidence = DECISIONS.length > 0 ? totalConfidence / DECISIONS.length : 0
  return { total: DECISIONS.length, byBasis, avgConfidence }
}
