import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type NeuralNodeType = "execution" | "workflow" | "agent" | "pattern" | "decision" | "remediation"
export type EdgeWeight = "strong" | "moderate" | "weak"

export interface NeuralNode {
  nodeId: string
  nodeType: NeuralNodeType
  label: string
  tenantId?: string
  activationCount: number
  lastActivatedAt?: string
  embeddingSignal: number
  createdAt: string
}

export interface NeuralEdge {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  weight: EdgeWeight
  coActivationCount: number
  relationshipType: string
  updatedAt: string
}

const GRAPH_NODES: Map<string, NeuralNode> = new Map()
const GRAPH_EDGES: Map<string, NeuralEdge> = new Map()
const NODE_CAP = 2000
const EDGE_CAP = 5000

export function getAllNodes(): Map<string, NeuralNode> { return GRAPH_NODES }
export function getAllEdges(): Map<string, NeuralEdge> { return GRAPH_EDGES }

export function addNode(label: string, nodeType: NeuralNodeType, tenantId?: string): NeuralNode {
  if (GRAPH_NODES.size >= NODE_CAP) {
    const firstKey = Array.from(GRAPH_NODES.keys())[0]
    GRAPH_NODES.delete(firstKey)
  }
  const node: NeuralNode = {
    nodeId: crypto.randomUUID(),
    nodeType,
    label,
    tenantId,
    activationCount: 0,
    embeddingSignal: 0,
    createdAt: new Date().toISOString(),
  }
  GRAPH_NODES.set(node.nodeId, node)
  logger.info(`Neural node added: ${label}`, "neural-graph", { metadata: { nodeId: node.nodeId, nodeType } })
  return node
}

export function addEdge(fromNodeId: string, toNodeId: string, relationshipType: string, weight: EdgeWeight = "moderate"): NeuralEdge {
  if (GRAPH_EDGES.size >= EDGE_CAP) {
    const firstKey = Array.from(GRAPH_EDGES.keys())[0]
    GRAPH_EDGES.delete(firstKey)
  }
  const key = `${fromNodeId}:${toNodeId}`
  const existing = GRAPH_EDGES.get(key)
  if (existing) return existing
  const edge: NeuralEdge = {
    edgeId: crypto.randomUUID(),
    fromNodeId,
    toNodeId,
    weight,
    coActivationCount: 0,
    relationshipType,
    updatedAt: new Date().toISOString(),
  }
  GRAPH_EDGES.set(key, edge)
  return edge
}

export function activateNode(nodeId: string): void {
  const node = GRAPH_NODES.get(nodeId)
  if (!node) return
  node.activationCount += 1
  node.lastActivatedAt = new Date().toISOString()
  node.embeddingSignal = Math.min(1, node.activationCount / 100)
}

export function coActivate(nodeIdA: string, nodeIdB: string): void {
  if (isRuntimePaused()) return
  activateNode(nodeIdA)
  activateNode(nodeIdB)
  const key = `${nodeIdA}:${nodeIdB}`
  const edge = GRAPH_EDGES.get(key)
  if (edge) {
    edge.coActivationCount += 1
    edge.updatedAt = new Date().toISOString()
  }
}

export function getNeighbors(nodeId: string): NeuralNode[] {
  return Array.from(GRAPH_EDGES.values())
    .filter(e => e.fromNodeId === nodeId || e.toNodeId === nodeId)
    .map(e => {
      const neighborId = e.fromNodeId === nodeId ? e.toNodeId : e.fromNodeId
      return GRAPH_NODES.get(neighborId)
    })
    .filter((n): n is NeuralNode => n !== undefined)
}

export function getStrongEdges(): NeuralEdge[] {
  return Array.from(GRAPH_EDGES.values()).filter(e => e.weight === "strong")
}

export function getGraphStats(): { nodes: number; edges: number; avgActivation: number; strongEdges: number } {
  const nodes = Array.from(GRAPH_NODES.values())
  const avgActivation = nodes.length > 0 ? nodes.reduce((s, n) => s + n.activationCount, 0) / nodes.length : 0
  return { nodes: GRAPH_NODES.size, edges: GRAPH_EDGES.size, avgActivation, strongEdges: getStrongEdges().length }
}
