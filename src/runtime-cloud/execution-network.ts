import { logger } from "@/runtime-core/observability"

export interface ExecutionNode {
  nodeId: string
  region: string
  partitionId?: string
  capacity: number
  used: number
  nodeType: "compute" | "coordinator" | "gateway" | "edge"
  status: "online" | "degraded" | "offline" | "draining"
  joinedAt: string
  lastHeartbeatAt: string
  labels: Record<string, string>
}

const NODES: Map<string, ExecutionNode> = new Map()
const NODES_CAP = 1000

export function addNode(
  region: string,
  capacity: number,
  nodeType: ExecutionNode["nodeType"],
  labels: Record<string, string> = {},
  partitionId?: string,
): ExecutionNode {
  if (NODES.size >= NODES_CAP) {
    const oldest = Array.from(NODES.keys())[0]
    if (oldest) NODES.delete(oldest)
  }
  const node: ExecutionNode = {
    nodeId: crypto.randomUUID(),
    region,
    partitionId,
    capacity,
    used: 0,
    nodeType,
    status: "online",
    joinedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    labels,
  }
  NODES.set(node.nodeId, node)
  logger.info("Execution node added", "execution-network", {
    metadata: { nodeId: node.nodeId, region, nodeType, capacity },
  })
  return node
}

export function updateNodeHealth(nodeId: string, used: number, status?: ExecutionNode["status"]): void {
  const node = NODES.get(nodeId)
  if (!node) return
  node.used = Math.max(0, used)
  if (status) node.status = status
}

export function drainNode(nodeId: string): void {
  const node = NODES.get(nodeId)
  if (!node) return
  node.status = "draining"
}

export function heartbeatNode(nodeId: string): void {
  const node = NODES.get(nodeId)
  if (!node) return
  node.lastHeartbeatAt = new Date().toISOString()
}

export function getBestNode(
  region?: string,
  nodeType?: ExecutionNode["nodeType"],
  labels?: Record<string, string>,
): ExecutionNode | undefined {
  const candidates = Array.from(NODES.values()).filter((n) => {
    if (n.status !== "online") return false
    if (region && n.region !== region) return false
    if (nodeType && n.nodeType !== nodeType) return false
    if (labels) {
      for (const [k, v] of Object.entries(labels)) {
        if (n.labels[k] !== v) return false
      }
    }
    return true
  })
  if (candidates.length === 0) return undefined
  return candidates.reduce((best, node) => {
    const bestUtil = best.capacity > 0 ? best.used / best.capacity : 1
    const nodeUtil = node.capacity > 0 ? node.used / node.capacity : 1
    return nodeUtil < bestUtil ? node : best
  })
}

export function getNetworkStats(): {
  total: number
  online: number
  degraded: number
  offline: number
  byType: Record<string, number>
  byRegion: Record<string, number>
  globalUtilizationPct: number
} {
  const all = Array.from(NODES.values())
  const byType: Record<string, number> = {}
  const byRegion: Record<string, number> = {}
  let online = 0, degraded = 0, offline = 0
  let totalCap = 0, totalUsed = 0
  for (const n of all) {
    if (n.status === "online") online++
    else if (n.status === "degraded") degraded++
    else if (n.status === "offline") offline++
    byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1
    byRegion[n.region] = (byRegion[n.region] ?? 0) + 1
    totalCap += n.capacity
    totalUsed += n.used
  }
  const globalUtilizationPct = totalCap > 0 ? (totalUsed / totalCap) * 100 : 0
  return { total: all.length, online, degraded, offline, byType, byRegion, globalUtilizationPct }
}
