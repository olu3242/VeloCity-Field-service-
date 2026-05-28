import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { getBestPartition, getAvailablePartitions } from "./partition-manager"

export type RoutingStrategy = "affinity" | "round_robin" | "least_loaded" | "region_pinned"

export interface RoutingDecision {
  decisionId: string
  executionId: string
  workflowType: string
  tenantId?: string
  selectedPartitionId: string
  strategy: RoutingStrategy
  alternativePartitions: string[]
  routedAt: string
  routingLatencyMs: number
}

const ROUTING_LOG: RoutingDecision[] = []
const ROUTING_CAP = 2000

function appendRouting(decision: RoutingDecision): void {
  if (ROUTING_LOG.length >= ROUTING_CAP) ROUTING_LOG.shift()
  ROUTING_LOG.push(decision)
}

export function routeExecution(
  executionId: string,
  workflowType: string,
  tenantId?: string,
  preferredRegion?: string,
): RoutingDecision {
  if (isRuntimePaused()) {
    logger.warn("routeExecution blocked: runtime is paused", "execution-router", {
      metadata: { executionId },
    })
    throw new Error("Runtime is paused — routing blocked")
  }

  const start = Date.now()
  const best = getBestPartition(workflowType, tenantId)
  if (!best) throw new Error("No available partition to route execution")

  const strategy: RoutingStrategy =
    tenantId !== undefined && best.affinityTags.includes(tenantId)
      ? "affinity"
      : preferredRegion !== undefined
        ? "region_pinned"
        : "least_loaded"

  const alternatives = getAvailablePartitions(preferredRegion)
    .filter((p) => p.partitionId !== best.partitionId)
    .slice(0, 3)
    .map((p) => p.partitionId)

  const decision: RoutingDecision = {
    decisionId: crypto.randomUUID(),
    executionId,
    workflowType,
    tenantId,
    selectedPartitionId: best.partitionId,
    strategy,
    alternativePartitions: alternatives,
    routedAt: new Date().toISOString(),
    routingLatencyMs: Date.now() - start,
  }
  appendRouting(decision)
  logger.info(`Execution routed to partition`, "execution-router", {
    metadata: { executionId, partitionId: best.partitionId, strategy },
  })
  return decision
}

export function getRoutingHistory(executionId: string): RoutingDecision[] {
  return ROUTING_LOG.filter((d) => d.executionId === executionId)
}

export function getRoutingStats(): {
  total: number
  byStrategy: Record<string, number>
  avgLatencyMs: number
} {
  const byStrategy: Record<string, number> = {}
  let totalLatency = 0
  for (const d of ROUTING_LOG) {
    byStrategy[d.strategy] = (byStrategy[d.strategy] ?? 0) + 1
    totalLatency += d.routingLatencyMs
  }
  const total = ROUTING_LOG.length
  return { total, byStrategy, avgLatencyMs: total > 0 ? totalLatency / total : 0 }
}
