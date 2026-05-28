import { logger } from "@/runtime-core/observability"

export interface CognitionLineageNode {
  nodeId: string
  decisionId: string
  tenantId?: string
  parentDecisionId?: string
  depth: number
  decisionType: string
  confidence: number
  childDecisionIds: string[]
  createdAt: string
}

const LINEAGE_NODES = new Map<string, CognitionLineageNode>()
const LINEAGE_NODES_CAP = 2000

export function recordDecision(
  decisionId: string,
  decisionType: string,
  confidence: number,
  parentDecisionId?: string,
  tenantId?: string
): CognitionLineageNode {
  if (LINEAGE_NODES.size >= LINEAGE_NODES_CAP) {
    const firstKey = Array.from(LINEAGE_NODES.keys())[0]
    if (firstKey !== undefined) LINEAGE_NODES.delete(firstKey)
    logger.warn("LINEAGE_NODES cap reached, evicted oldest entry")
  }

  const parentNode = parentDecisionId ? LINEAGE_NODES.get(parentDecisionId) : undefined
  const depth = parentNode !== undefined ? parentNode.depth + 1 : 0

  const node: CognitionLineageNode = {
    nodeId: crypto.randomUUID(),
    decisionId,
    tenantId,
    parentDecisionId,
    depth,
    decisionType,
    confidence,
    childDecisionIds: [],
    createdAt: new Date().toISOString(),
  }
  LINEAGE_NODES.set(decisionId, node)

  if (parentNode) {
    parentNode.childDecisionIds.push(decisionId)
  }

  return node
}

export function getDecisionChain(decisionId: string): CognitionLineageNode[] {
  const chain: CognitionLineageNode[] = []
  let current = LINEAGE_NODES.get(decisionId)
  while (current !== undefined) {
    chain.unshift(current)
    current = current.parentDecisionId
      ? LINEAGE_NODES.get(current.parentDecisionId)
      : undefined
  }
  return chain
}

export function getDescendants(decisionId: string): CognitionLineageNode[] {
  const root = LINEAGE_NODES.get(decisionId)
  if (!root) return []
  const result: CognitionLineageNode[] = []
  const queue: string[] = [...root.childDecisionIds]
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined) continue
    const node = LINEAGE_NODES.get(id)
    if (!node) continue
    result.push(node)
    queue.push(...node.childDecisionIds)
  }
  return result
}

export function getLineageSummary(): {
  totalNodes: number
  maxDepth: number
  avgConfidence: number
  rootDecisions: number
} {
  const all = Array.from(LINEAGE_NODES.values())
  const totalNodes = all.length
  const maxDepth = totalNodes > 0 ? Math.max(...all.map((n) => n.depth)) : 0
  const avgConfidence = totalNodes > 0 ? all.reduce((s, n) => s + n.confidence, 0) / totalNodes : 0
  const rootDecisions = all.filter((n) => n.parentDecisionId === undefined).length
  return { totalNodes, maxDepth, avgConfidence, rootDecisions }
}
