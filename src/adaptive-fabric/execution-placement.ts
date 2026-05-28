import { logger } from "@/runtime-core/observability"

export interface PlacementDecision {
  decisionId: string
  executionId: string
  workflowType: string
  tenantId?: string
  selectedNodeId: string
  selectedRegion: string
  placementStrategy: "affinity" | "least_loaded" | "cost_optimized" | "latency_optimized"
  affinityScore: number
  estimatedLatencyMs: number
  decidedAt: string
}

const DECISIONS: PlacementDecision[] = []
const CAP = 3000

export interface AvailableNode {
  nodeId: string
  region: string
  load: number
}

export function placeExecution(
  executionId: string,
  workflowType: string,
  availableNodes: AvailableNode[],
  tenantId?: string
): PlacementDecision {
  if (availableNodes.length === 0) {
    throw new Error("No available nodes for placement")
  }
  let selected = availableNodes[0]
  for (const node of availableNodes) {
    if (node.load < selected.load) selected = node
  }
  if (DECISIONS.length >= CAP) DECISIONS.shift()
  const decision: PlacementDecision = {
    decisionId: crypto.randomUUID(),
    executionId,
    workflowType,
    tenantId,
    selectedNodeId: selected.nodeId,
    selectedRegion: selected.region,
    placementStrategy: "least_loaded",
    affinityScore: 0.8,
    estimatedLatencyMs: 50 + Math.floor(selected.load * 100),
    decidedAt: new Date().toISOString(),
  }
  DECISIONS.push(decision)
  logger.info(`Placed ${executionId} on node ${selected.nodeId}`, "execution-placement")
  return decision
}

export function getPlacementHistory(workflowType: string, limit?: number): PlacementDecision[] {
  const filtered = DECISIONS.filter(d => d.workflowType === workflowType)
  return limit !== undefined ? filtered.slice(-limit) : filtered
}

export function getPlacementStats(): {
  total: number
  byStrategy: Record<string, number>
  avgAffinityScore: number
  avgLatencyMs: number
} {
  const byStrategy: Record<string, number> = {}
  let totalAffinity = 0
  let totalLatency = 0
  for (const d of DECISIONS) {
    byStrategy[d.placementStrategy] = (byStrategy[d.placementStrategy] ?? 0) + 1
    totalAffinity += d.affinityScore
    totalLatency += d.estimatedLatencyMs
  }
  const count = DECISIONS.length
  return {
    total: count,
    byStrategy,
    avgAffinityScore: count > 0 ? totalAffinity / count : 0,
    avgLatencyMs: count > 0 ? totalLatency / count : 0,
  }
}
