import { logger } from "@/runtime-core/observability"
import { type NeuralNodeType, getAllNodes, getAllEdges } from "./neural-graph"

export interface CognitionCluster {
  clusterId: string
  clusterName: string
  nodeIds: string[]
  dominantNodeType: NeuralNodeType
  activationDensity: number
  cohesion: number
  tenantId?: string
  discoveredAt: string
}

const CLUSTERS: Map<string, CognitionCluster> = new Map()
const CLUSTER_CAP = 200

export function discoverClusters(): CognitionCluster[] {
  const nodeMap = getAllNodes()
  const edgeMap = getAllEdges()
  logger.info("Discovering cognition clusters", "cognition-topology", { metadata: { nodeCount: nodeMap.size } })

  const byType = new Map<NeuralNodeType, string[]>()
  for (const node of Array.from(nodeMap.values())) {
    const existing = byType.get(node.nodeType) ?? []
    existing.push(node.nodeId)
    byType.set(node.nodeType, existing)
  }

  const discovered: CognitionCluster[] = []
  for (const [nodeType, nodeIds] of Array.from(byType.entries())) {
    const nodeSet = new Set(nodeIds)
    let edgeCount = 0
    for (const edge of Array.from(edgeMap.values())) {
      if (nodeSet.has(edge.fromNodeId) && nodeSet.has(edge.toNodeId)) edgeCount++
    }
    const n = nodeIds.length
    const cohesion = n > 1 ? Math.min(1, edgeCount / (n * n)) : 0
    const totalActivation = nodeIds.reduce((s, id) => {
      const node = nodeMap.get(id)
      return s + (node?.activationCount ?? 0)
    }, 0)
    const activationDensity = n > 0 ? totalActivation / n : 0

    if (CLUSTERS.size >= CLUSTER_CAP) {
      const firstKey = Array.from(CLUSTERS.keys())[0]
      CLUSTERS.delete(firstKey)
    }
    const cluster: CognitionCluster = {
      clusterId: crypto.randomUUID(),
      clusterName: `${nodeType}-cluster`,
      nodeIds,
      dominantNodeType: nodeType,
      activationDensity,
      cohesion,
      discoveredAt: new Date().toISOString(),
    }
    CLUSTERS.set(cluster.clusterId, cluster)
    discovered.push(cluster)
  }
  return discovered
}

export function getCluster(clusterId: string): CognitionCluster | undefined {
  return CLUSTERS.get(clusterId)
}

export function getClustersByDensity(minDensity = 0): CognitionCluster[] {
  return Array.from(CLUSTERS.values())
    .filter(c => c.activationDensity >= minDensity)
    .sort((a, b) => b.activationDensity - a.activationDensity)
}

export function getTopologyReport(): { totalClusters: number; totalNodes: number; mostActivatedCluster: string | undefined } {
  const clusters = Array.from(CLUSTERS.values())
  const totalNodes = clusters.reduce((s, c) => s + c.nodeIds.length, 0)
  const mostActivated = [...clusters].sort((a, b) => b.activationDensity - a.activationDensity)[0]
  return { totalClusters: CLUSTERS.size, totalNodes, mostActivatedCluster: mostActivated?.clusterName }
}
