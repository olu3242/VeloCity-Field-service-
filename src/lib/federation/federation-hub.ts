export interface FederatedNode {
  nodeId: string
  nodeName: string
  nodeType: "platform" | "tenant_cluster" | "regional_hub" | "external_partner"
  status: "connected" | "degraded" | "isolated"
  trustScore: number
  latencyMs: number
  registeredAt: string
  lastSeenAt: string
}

const NODES: Map<string, FederatedNode> = new Map()
const CAP = 100

export function registerNode(
  nodeId: string,
  nodeName: string,
  nodeType: FederatedNode["nodeType"]
): FederatedNode {
  if (NODES.size >= CAP) {
    const firstKey = Array.from(NODES.keys())[0]
    if (firstKey !== undefined) NODES.delete(firstKey)
  }
  const node: FederatedNode = {
    nodeId,
    nodeName,
    nodeType,
    status: "connected",
    trustScore: 80,
    latencyMs: 50,
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  }
  NODES.set(nodeId, node)
  return node
}

export function updateNodeStatus(
  nodeId: string,
  status: FederatedNode["status"],
  latencyMs: number,
  trustScore: number
): void {
  const node = NODES.get(nodeId)
  if (!node) return
  node.status = status
  node.latencyMs = latencyMs
  node.trustScore = Math.min(100, Math.max(0, trustScore))
  node.lastSeenAt = new Date().toISOString()
}

export function getConnectedNodes(): FederatedNode[] {
  return Array.from(NODES.values()).filter(n => n.status === "connected")
}

export function getTrustedNodes(minTrustScore = 70): FederatedNode[] {
  return Array.from(NODES.values()).filter(n => n.trustScore >= minTrustScore)
}

export function getFederationHealth(): {
  total: number
  connected: number
  degraded: number
  avgTrustScore: number
  avgLatencyMs: number
} {
  const nodes = Array.from(NODES.values())
  const connected = nodes.filter(n => n.status === "connected").length
  const degraded = nodes.filter(n => n.status === "degraded").length
  const avgTrustScore = nodes.length > 0 ? nodes.reduce((s, n) => s + n.trustScore, 0) / nodes.length : 0
  const avgLatencyMs = nodes.length > 0 ? nodes.reduce((s, n) => s + n.latencyMs, 0) / nodes.length : 0
  return { total: nodes.length, connected, degraded, avgTrustScore, avgLatencyMs }
}
