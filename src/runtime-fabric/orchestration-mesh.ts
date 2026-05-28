import { logger } from "@/runtime-core/observability"

export interface MeshNode {
  nodeId: string
  partitionId: string
  region: string
  role: "primary" | "replica" | "arbiter"
  status: "connected" | "degraded" | "disconnected"
  connectedPeers: string[]
  registeredAt: string
  lastSeenAt: string
}

const MESH_NODES: Map<string, MeshNode> = new Map()
const MESH_CAP = 200

export function registerMeshNode(
  partitionId: string,
  region: string,
  role: MeshNode["role"],
): MeshNode {
  if (MESH_NODES.size >= MESH_CAP) {
    const oldest = Array.from(MESH_NODES.keys())[0]
    if (oldest !== undefined) MESH_NODES.delete(oldest)
  }
  const node: MeshNode = {
    nodeId: crypto.randomUUID(),
    partitionId,
    region,
    role,
    status: "connected",
    connectedPeers: [],
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  }
  MESH_NODES.set(node.nodeId, node)
  logger.info(`Mesh node registered`, "orchestration-mesh", {
    metadata: { nodeId: node.nodeId, partitionId, region, role },
  })
  return node
}

export function updateNodeStatus(nodeId: string, status: MeshNode["status"]): void {
  const node = MESH_NODES.get(nodeId)
  if (!node) return
  node.status = status
  node.lastSeenAt = new Date().toISOString()
  logger.debug(`Mesh node status updated to ${status}`, "orchestration-mesh", {
    metadata: { nodeId },
  })
}

export function connectPeers(nodeId: string, peerNodeId: string): void {
  const node = MESH_NODES.get(nodeId)
  if (node && !node.connectedPeers.includes(peerNodeId)) {
    node.connectedPeers.push(peerNodeId)
  }
  const peer = MESH_NODES.get(peerNodeId)
  if (peer && !peer.connectedPeers.includes(nodeId)) {
    peer.connectedPeers.push(nodeId)
  }
}

export function getPrimaryForPartition(partitionId: string): MeshNode | undefined {
  return Array.from(MESH_NODES.values()).find(
    (n) => n.partitionId === partitionId && n.role === "primary" && n.status === "connected",
  )
}

export function getMeshTopology(): {
  totalNodes: number
  connected: number
  regions: string[]
  primaryCount: number
} {
  const nodes = Array.from(MESH_NODES.values())
  const regions = Array.from(new Set(nodes.map((n) => n.region)))
  return {
    totalNodes: nodes.length,
    connected: nodes.filter((n) => n.status === "connected").length,
    regions,
    primaryCount: nodes.filter((n) => n.role === "primary").length,
  }
}
