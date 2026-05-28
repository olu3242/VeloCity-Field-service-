import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { GraphNode, GraphEdge, WorkflowGraph } from "./graph-types"

const GRAPHS = new Map<string, WorkflowGraph>()
const CAP = 500

type NodeConfig = Omit<GraphNode, "workflowId" | "outputs">
type EdgeConfig = Omit<GraphEdge, "edgeId" | "workflowId">

function buildGraph(
  workflowId: string,
  workflowType: string,
  nodeConfigs: NodeConfig[],
  edgeConfigs: EdgeConfig[],
  version: number,
  tenantId?: string
): WorkflowGraph {
  const nodeIds = new Set(nodeConfigs.map((n) => n.nodeId))
  const duplicates = nodeConfigs.filter((n, i) => nodeConfigs.findIndex((x) => x.nodeId === n.nodeId) !== i)
  if (duplicates.length > 0) throw new Error(`Duplicate nodeIds: ${duplicates.map((d) => d.nodeId).join(", ")}`)

  // Compute outputs: for each node, find all edges where fromNodeId === nodeId
  const outputsMap = new Map<string, string[]>()
  for (const nodeConfig of nodeConfigs) outputsMap.set(nodeConfig.nodeId, [])
  for (const edge of edgeConfigs) {
    const outs = outputsMap.get(edge.fromNodeId) ?? []
    outs.push(edge.toNodeId)
    outputsMap.set(edge.fromNodeId, outs)
  }

  const nodes = new Map<string, GraphNode>()
  for (const cfg of nodeConfigs) {
    nodes.set(cfg.nodeId, {
      ...cfg,
      workflowId,
      outputs: outputsMap.get(cfg.nodeId) ?? [],
    })
  }

  const edges: GraphEdge[] = edgeConfigs.map((ec) => ({
    ...ec,
    edgeId: crypto.randomUUID(),
    workflowId,
  }))

  const entryNode = nodeConfigs.find((n) => n.nodeType === "start")
  if (!entryNode) throw new Error("No start node found in nodeConfigs")
  if (!nodeIds.has(entryNode.nodeId)) throw new Error(`Entry nodeId ${entryNode.nodeId} not in nodes`)

  const exitNodeIds = nodeConfigs.filter((n) => n.nodeType === "end").map((n) => n.nodeId)

  return {
    graphId: crypto.randomUUID(),
    workflowId,
    workflowType,
    tenantId,
    nodes,
    edges,
    entryNodeId: entryNode.nodeId,
    exitNodeIds,
    compiledAt: new Date().toISOString(),
    version,
  }
}

export function compileGraph(
  workflowId: string,
  workflowType: string,
  nodeConfigs: NodeConfig[],
  edgeConfigs: EdgeConfig[],
  options?: { tenantId?: string }
): WorkflowGraph {
  if (isRuntimePaused()) {
    logger.warn("compileGraph blocked — runtime paused", "graph-compiler", { workflowId })
    throw new Error("Runtime is paused")
  }
  while (GRAPHS.size >= CAP) {
    const firstKey = Array.from(GRAPHS.keys())[0]
    if (firstKey !== undefined) GRAPHS.delete(firstKey)
  }
  const graph = buildGraph(workflowId, workflowType, nodeConfigs, edgeConfigs, 1, options?.tenantId)
  GRAPHS.set(workflowId, graph)
  return graph
}

export function getGraph(workflowId: string): WorkflowGraph | undefined {
  return GRAPHS.get(workflowId)
}

export function recompileGraph(
  workflowId: string,
  nodeConfigs: NodeConfig[],
  edgeConfigs: EdgeConfig[]
): WorkflowGraph {
  if (isRuntimePaused()) {
    logger.warn("recompileGraph blocked — runtime paused", "graph-compiler", { workflowId })
    throw new Error("Runtime is paused")
  }
  const existing = GRAPHS.get(workflowId)
  const version = existing !== undefined ? existing.version + 1 : 1
  const workflowType = existing?.workflowType ?? "unknown"
  const tenantId = existing?.tenantId
  const graph = buildGraph(workflowId, workflowType, nodeConfigs, edgeConfigs, version, tenantId)
  GRAPHS.set(workflowId, graph)
  return graph
}

export function getGraphSummary(): { total: number; byWorkflowType: Record<string, number>; avgNodeCount: number } {
  const all = Array.from(GRAPHS.values())
  const byWorkflowType: Record<string, number> = {}
  let totalNodes = 0
  for (const g of all) {
    byWorkflowType[g.workflowType] = (byWorkflowType[g.workflowType] ?? 0) + 1
    totalNodes += g.nodes.size
  }
  return { total: all.length, byWorkflowType, avgNodeCount: all.length > 0 ? totalNodes / all.length : 0 }
}
