import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface FederatedMemoryNode {
  nodeId: string; regionId: string; tenantId?: string
  contextIds: string[]; replicaOf?: string
  syncedAt: string; lagMs: number; healthy: boolean
}

const NODES: Map<string, FederatedMemoryNode> = new Map()
const NODES_CAP = 200

export function registerNode(nodeId: string, regionId: string, tenantId?: string): FederatedMemoryNode {
  void isRuntimePaused()
  if (NODES.size >= NODES_CAP && !NODES.has(nodeId)) {
    const firstKey = Array.from(NODES.keys())[0]
    if (firstKey !== undefined) NODES.delete(firstKey)
  }
  const node: FederatedMemoryNode = {
    nodeId, regionId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    contextIds: [], syncedAt: new Date().toISOString(), lagMs: 0, healthy: true,
  }
  NODES.set(nodeId, node)
  logger.info("distributed-federation", { nodeId, regionId })
  return node
}

export function syncNode(nodeId: string, contextIds: string[], lagMs: number): void {
  const node = NODES.get(nodeId)
  if (!node) return
  node.contextIds = contextIds
  node.lagMs = lagMs
  node.syncedAt = new Date().toISOString()
  node.healthy = lagMs < 5000
  logger.info("distributed-federation", { nodeId, lagMs, healthy: node.healthy, contextCount: contextIds.length })
}

export function getHealthyNodes(tenantId?: string): FederatedMemoryNode[] {
  const all = Array.from(NODES.values()).filter(n => n.healthy)
  if (tenantId === undefined) return all
  return all.filter(n => n.tenantId === tenantId)
}

export function getFederationSummary(): {
  totalNodes: number; healthy: number; unhealthy: number; avgLagMs: number; totalContextsReplicated: number
} {
  const all = Array.from(NODES.values())
  const totalNodes = all.length
  const healthy = all.filter(n => n.healthy).length
  const unhealthy = totalNodes - healthy
  const avgLagMs = totalNodes > 0 ? all.reduce((s, n) => s + n.lagMs, 0) / totalNodes : 0
  const totalContextsReplicated = all.reduce((s, n) => s + n.contextIds.length, 0)
  return { totalNodes, healthy, unhealthy, avgLagMs, totalContextsReplicated }
}
