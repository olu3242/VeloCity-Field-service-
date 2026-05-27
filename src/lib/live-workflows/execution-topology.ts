/**
 * Execution Topology — models the live execution graph of agents, queues, and events.
 * In-memory singleton with rolling cap of 100 nodes.
 */

const NODES_CAP = 100

export interface TopologyNode {
  nodeId: string
  nodeType: "agent" | "queue" | "event" | "gateway" | "external"
  label: string
  status: "active" | "idle" | "failed"
  connections: string[]
  metrics: { throughput: number; errorRate: number; latencyMs: number }
}

const NODES: Map<string, TopologyNode> = new Map()

function enforceCap(): void {
  if (NODES.size >= NODES_CAP) {
    const firstKey = Array.from(NODES.keys())[0]
    if (firstKey !== undefined) NODES.delete(firstKey)
  }
}

export function registerNode(
  nodeId: string,
  nodeType: TopologyNode["nodeType"],
  label: string
): TopologyNode {
  enforceCap()
  const node: TopologyNode = {
    nodeId,
    nodeType,
    label,
    status: "idle",
    connections: [],
    metrics: { throughput: 0, errorRate: 0, latencyMs: 0 },
  }
  NODES.set(nodeId, node)
  return node
}

export function updateNodeStatus(
  nodeId: string,
  status: TopologyNode["status"],
  metrics?: Partial<TopologyNode["metrics"]>
): void {
  const node = NODES.get(nodeId)
  if (!node) return
  node.status = status
  if (metrics) {
    node.metrics = { ...node.metrics, ...metrics }
  }
}

export function addConnection(fromNodeId: string, toNodeId: string): void {
  const node = NODES.get(fromNodeId)
  if (!node) return
  if (!node.connections.includes(toNodeId)) {
    node.connections.push(toNodeId)
  }
}

export function getTopology(): TopologyNode[] {
  return Array.from(NODES.values())
}

export function getActiveNodes(): TopologyNode[] {
  return Array.from(NODES.values()).filter((n) => n.status === "active")
}

export function getFailedNodes(): TopologyNode[] {
  return Array.from(NODES.values()).filter((n) => n.status === "failed")
}
