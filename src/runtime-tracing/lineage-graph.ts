import { logger } from "@/runtime-core/observability"

export interface LineageNode {
  nodeId: string
  executionId: string
  workflowType: string
  depth: number
  tenantId?: string
  status: "completed" | "failed" | "active" | "unknown"
  durationMs?: number
  children: string[]
}

export interface LineageGraph {
  graphId: string
  rootExecutionId: string
  tenantId?: string
  correlationId: string
  nodes: Map<string, LineageNode>
  totalNodes: number
  maxDepth: number
  builtAt: string
}

export interface LineageGraphDTO {
  graphId: string
  rootExecutionId: string
  correlationId: string
  nodes: LineageNode[]
  totalNodes: number
  maxDepth: number
}

const GRAPHS: Map<string, LineageGraph> = new Map()
const MAX_GRAPHS = 500

export function buildLineageGraph(
  rootExecutionId: string,
  correlationId: string,
  tenantId?: string
): LineageGraph {
  if (GRAPHS.size >= MAX_GRAPHS) {
    const oldest = Array.from(GRAPHS.keys())[0]
    if (oldest !== undefined) GRAPHS.delete(oldest)
  }

  const rootNode: LineageNode = {
    nodeId: crypto.randomUUID(),
    executionId: rootExecutionId,
    workflowType: "root",
    depth: 0,
    tenantId,
    status: "active",
    children: [],
  }

  const nodes = new Map<string, LineageNode>()
  nodes.set(rootExecutionId, rootNode)

  const graph: LineageGraph = {
    graphId: crypto.randomUUID(),
    rootExecutionId,
    tenantId,
    correlationId,
    nodes,
    totalNodes: 1,
    maxDepth: 0,
    builtAt: new Date().toISOString(),
  }

  GRAPHS.set(rootExecutionId, graph)
  logger.info(`Lineage graph built for: ${rootExecutionId}`, "lineage-graph")
  return graph
}

export function addNodeToGraph(
  rootExecutionId: string,
  executionId: string,
  workflowType: string,
  depth: number,
  status: LineageNode["status"],
  durationMs?: number
): void {
  const graph = GRAPHS.get(rootExecutionId)
  if (!graph) return

  const node: LineageNode = {
    nodeId: crypto.randomUUID(),
    executionId,
    workflowType,
    depth,
    tenantId: graph.tenantId,
    status,
    durationMs,
    children: [],
  }

  graph.nodes.set(executionId, node)
  graph.totalNodes = graph.nodes.size
  if (depth > graph.maxDepth) graph.maxDepth = depth
}

export function getGraph(rootExecutionId: string): LineageGraph | undefined {
  return GRAPHS.get(rootExecutionId)
}

export function exportGraphDTO(rootExecutionId: string): LineageGraphDTO | undefined {
  const graph = GRAPHS.get(rootExecutionId)
  if (!graph) return undefined
  return {
    graphId: graph.graphId,
    rootExecutionId: graph.rootExecutionId,
    correlationId: graph.correlationId,
    nodes: Array.from(graph.nodes.values()),
    totalNodes: graph.totalNodes,
    maxDepth: graph.maxDepth,
  }
}

export function getGraphSummary(): {
  total: number
  avgNodes: number
  avgDepth: number
} {
  const values = Array.from(GRAPHS.values())
  const total = values.length
  const avgNodes = total > 0 ? values.reduce((sum, g) => sum + g.totalNodes, 0) / total : 0
  const avgDepth = total > 0 ? values.reduce((sum, g) => sum + g.maxDepth, 0) / total : 0
  return { total, avgNodes, avgDepth }
}
