import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface FederationNode {
  nodeId: string
  federationId: string
  region: string
  role: "primary" | "secondary" | "observer"
  status: "connected" | "degraded" | "disconnected" | "handshaking"
  trustedSince?: string
  lastPingAt?: string
  latencyMs: number
  supportedWorkflowTypes: string[]
  joinedAt: string
}

const NETWORK_NODES: Map<string, FederationNode> = new Map()
const NODES_CAP = 500

function pruneNodes(): void {
  if (NETWORK_NODES.size >= NODES_CAP) {
    const oldest = Array.from(NETWORK_NODES.keys())[0]
    if (oldest) NETWORK_NODES.delete(oldest)
  }
}

export function joinNetwork(
  federationId: string,
  region: string,
  role: FederationNode["role"],
  supportedWorkflowTypes: string[] = [],
): FederationNode {
  if (isRuntimePaused()) {
    logger.warn("joinNetwork blocked: runtime is paused", "federation-network", { metadata: { federationId, region } })
    throw new Error("Runtime is paused — federation join blocked")
  }
  pruneNodes()
  const node: FederationNode = {
    nodeId: crypto.randomUUID(),
    federationId,
    region,
    role,
    status: "handshaking",
    latencyMs: 0,
    supportedWorkflowTypes,
    joinedAt: new Date().toISOString(),
  }
  NETWORK_NODES.set(node.nodeId, node)
  logger.info("Node joined federation network", "federation-network", {
    metadata: { nodeId: node.nodeId, federationId, region, role },
  })
  return node
}

export function updateNodeStatus(
  nodeId: string,
  status: FederationNode["status"],
  latencyMs?: number,
): void {
  const node = NETWORK_NODES.get(nodeId)
  if (!node) return
  node.status = status
  if (latencyMs !== undefined) node.latencyMs = latencyMs
  if (status === "connected" && !node.trustedSince) {
    node.trustedSince = new Date().toISOString()
  }
}

export function leaveNetwork(nodeId: string): void {
  NETWORK_NODES.delete(nodeId)
}

export function ping(nodeId: string): void {
  const node = NETWORK_NODES.get(nodeId)
  if (!node) return
  node.lastPingAt = new Date().toISOString()
}

export function getConnectedNodes(federationId?: string): FederationNode[] {
  return Array.from(NETWORK_NODES.values()).filter(
    (n) => n.status === "connected" && (federationId === undefined || n.federationId === federationId),
  )
}

export function getNetworkTopology(): {
  total: number
  connected: number
  degraded: number
  disconnected: number
  byRegion: Record<string, number>
} {
  const all = Array.from(NETWORK_NODES.values())
  const byRegion: Record<string, number> = {}
  let connected = 0, degraded = 0, disconnected = 0
  for (const n of all) {
    if (n.status === "connected") connected++
    else if (n.status === "degraded") degraded++
    else if (n.status === "disconnected") disconnected++
    byRegion[n.region] = (byRegion[n.region] ?? 0) + 1
  }
  return { total: all.length, connected, degraded, disconnected, byRegion }
}
