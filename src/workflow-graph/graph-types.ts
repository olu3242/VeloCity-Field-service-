export type NodeType =
  | "start"
  | "end"
  | "task"
  | "gateway"
  | "join"
  | "compensation"
  | "checkpoint"
  | "ai_step"
  | "federation_call"

export type EdgeType = "sequence" | "conditional" | "parallel" | "compensation" | "error"

export interface GraphNode {
  nodeId: string
  nodeType: NodeType
  name: string
  workflowId: string
  stepIndex: number
  tenantId?: string
  config: Record<string, unknown>
  dependencies: string[]
  outputs: string[]
  retryPolicy?: { maxAttempts: number; baseDelayMs: number }
  timeoutMs?: number
}

export interface GraphEdge {
  edgeId: string
  edgeType: EdgeType
  fromNodeId: string
  toNodeId: string
  condition?: string
  workflowId: string
}

export interface WorkflowGraph {
  graphId: string
  workflowId: string
  workflowType: string
  tenantId?: string
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  entryNodeId: string
  exitNodeIds: string[]
  compiledAt: string
  version: number
}

export interface WorkflowGraphDTO extends Omit<WorkflowGraph, "nodes"> {
  nodes: GraphNode[]
}

export function toDTO(graph: WorkflowGraph): WorkflowGraphDTO {
  return {
    ...graph,
    nodes: Array.from(graph.nodes.values()),
  }
}
