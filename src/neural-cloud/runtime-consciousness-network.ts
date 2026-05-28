import { logger } from "@/runtime-core/observability"

export interface ConsciousnessNode {
  nodeId: string
  region?: string
  awarenessLevel: string
  healthEstimate: number
  activeIncidents: number
  lastBroadcastAt?: string
  peersInformed: number
}

export interface ConsciousnessBroadcast {
  broadcastId: string
  sourceNodeId: string
  awarenessLevel: string
  healthEstimate: number
  activeIncidents: number
  broadcastAt: string
  receivedByCount: number
}

const CONSCIOUSNESS_NODES: Map<string, ConsciousnessNode> = new Map()
const BROADCASTS: ConsciousnessBroadcast[] = []
const MAX_NODES = 500
const MAX_BROADCASTS = 1000

function capNodes(): void {
  if (CONSCIOUSNESS_NODES.size > MAX_NODES) {
    const firstKey = Array.from(CONSCIOUSNESS_NODES.keys())[0]
    if (firstKey !== undefined) CONSCIOUSNESS_NODES.delete(firstKey)
  }
}

function capBroadcasts(): void {
  while (BROADCASTS.length > MAX_BROADCASTS) BROADCASTS.shift()
}

export function registerConsciousnessNode(
  nodeId: string,
  region?: string,
): ConsciousnessNode {
  const node: ConsciousnessNode = {
    nodeId,
    region,
    awarenessLevel: "aware",
    healthEstimate: 100,
    activeIncidents: 0,
    peersInformed: 0,
  }
  CONSCIOUSNESS_NODES.set(nodeId, node)
  capNodes()
  logger.info(`Consciousness node registered: ${nodeId}`, "runtime-consciousness-network", {
    metadata: { nodeId, region },
  })
  return node
}

export function updateNodeAwareness(
  nodeId: string,
  level: string,
  health: number,
  incidents: number,
): void {
  const node = CONSCIOUSNESS_NODES.get(nodeId)
  if (!node) return
  node.awarenessLevel = level
  node.healthEstimate = Math.max(0, Math.min(100, health))
  node.activeIncidents = incidents
}

export function broadcast(sourceNodeId: string): ConsciousnessBroadcast {
  const node = CONSCIOUSNESS_NODES.get(sourceNodeId)
  const receivedByCount = Math.max(0, CONSCIOUSNESS_NODES.size - 1)
  const bc: ConsciousnessBroadcast = {
    broadcastId: crypto.randomUUID(),
    sourceNodeId,
    awarenessLevel: node?.awarenessLevel ?? "unknown",
    healthEstimate: node?.healthEstimate ?? 0,
    activeIncidents: node?.activeIncidents ?? 0,
    broadcastAt: new Date().toISOString(),
    receivedByCount,
  }
  BROADCASTS.push(bc)
  capBroadcasts()
  if (node) {
    node.lastBroadcastAt = bc.broadcastAt
    node.peersInformed += receivedByCount
  }
  return bc
}

export function getNetworkConsensus(): { dominantLevel: string; avgHealth: number; totalIncidents: number } {
  const nodes = Array.from(CONSCIOUSNESS_NODES.values())
  if (nodes.length === 0) return { dominantLevel: "unknown", avgHealth: 0, totalIncidents: 0 }
  const levelCounts: Record<string, number> = {}
  let totalHealth = 0
  let totalIncidents = 0
  for (const n of nodes) {
    levelCounts[n.awarenessLevel] = (levelCounts[n.awarenessLevel] ?? 0) + 1
    totalHealth += n.healthEstimate
    totalIncidents += n.activeIncidents
  }
  const dominantLevel = Array.from(Object.entries(levelCounts)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown"
  return { dominantLevel, avgHealth: totalHealth / nodes.length, totalIncidents }
}

export function getNetworkSummary(): { totalNodes: number; broadcasts: number; avgHealth: number } {
  const nodes = Array.from(CONSCIOUSNESS_NODES.values())
  const avgHealth = nodes.length > 0 ? nodes.reduce((s, n) => s + n.healthEstimate, 0) / nodes.length : 0
  return { totalNodes: CONSCIOUSNESS_NODES.size, broadcasts: BROADCASTS.length, avgHealth }
}
