import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface OperationalNode {
  nodeId: string
  name: string
  nodeType: "subsystem" | "workflow" | "agent" | "integration" | "queue"
  health: number
  dependsOn: string[]
  tenantId?: string
  metadata: Record<string, unknown>
  registeredAt: string
}

const GRAPH: Map<string, OperationalNode> = new Map()
const CAP = 500

export function addNode(
  name: string,
  nodeType: OperationalNode["nodeType"],
  health: number,
  dependsOn: string[],
  options?: { tenantId?: string; metadata?: Record<string, unknown> },
): OperationalNode {
  if (isRuntimePaused()) {
    logger.warn("addNode blocked: runtime paused", "operational-graph")
  }
  if (GRAPH.size >= CAP) {
    const firstKey = Array.from(GRAPH.keys())[0]
    if (firstKey) GRAPH.delete(firstKey)
  }
  const node: OperationalNode = {
    nodeId: crypto.randomUUID(),
    name,
    nodeType,
    health: Math.max(0, Math.min(100, health)),
    dependsOn,
    tenantId: options?.tenantId,
    metadata: options?.metadata ?? {},
    registeredAt: new Date().toISOString(),
  }
  GRAPH.set(node.nodeId, node)
  logger.info(`Operational node added: ${name} (${nodeType})`, "operational-graph")
  return node
}

export function updateHealth(nodeId: string, health: number): void {
  const node = GRAPH.get(nodeId)
  if (node) node.health = Math.max(0, Math.min(100, health))
}

export function getDependents(nodeId: string): OperationalNode[] {
  return Array.from(GRAPH.values()).filter((n) => n.dependsOn.includes(nodeId))
}

function transitiveDependent(nodeId: string, visited: Set<string>): OperationalNode[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)
  const directDeps = getDependents(nodeId)
  const result: OperationalNode[] = [...directDeps]
  for (const dep of directDeps) {
    result.push(...transitiveDependent(dep.nodeId, visited))
  }
  return result
}

export function getAffectedByFailure(nodeId: string): OperationalNode[] {
  const visited = new Set<string>()
  return transitiveDependent(nodeId, visited)
}

export function getGraphSummary(): {
  totalNodes: number; avgHealth: number; criticalNodes: string[]
} {
  const nodes = Array.from(GRAPH.values())
  const totalNodes = nodes.length
  const avgHealth = totalNodes > 0 ? nodes.reduce((s, n) => s + n.health, 0) / totalNodes : 0
  const criticalNodes: string[] = []
  for (const node of nodes) {
    if (node.health < 30 && getDependents(node.nodeId).length > 0) {
      criticalNodes.push(node.nodeId)
    }
  }
  return { totalNodes, avgHealth: Math.round(avgHealth * 10) / 10, criticalNodes }
}
