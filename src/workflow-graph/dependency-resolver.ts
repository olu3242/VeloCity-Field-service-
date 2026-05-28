import { WorkflowGraph } from "./graph-types"

export interface ExecutionPlan {
  planId: string
  workflowId: string
  phases: string[][]
  totalNodes: number
  totalPhases: number
  hasCycles: boolean
  resolvedAt: string
}

export function resolveExecutionPlan(graph: WorkflowGraph): ExecutionPlan {
  const nodes = Array.from(graph.nodes.values())
  const nodeIds = nodes.map((n) => n.nodeId)

  // Build in-degree map and adjacency list from dependencies
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>() // node -> nodes that depend on it

  for (const nodeId of nodeIds) {
    if (!inDegree.has(nodeId)) inDegree.set(nodeId, 0)
    if (!dependents.has(nodeId)) dependents.set(nodeId, [])
  }

  for (const node of nodes) {
    for (const dep of node.dependencies) {
      inDegree.set(node.nodeId, (inDegree.get(node.nodeId) ?? 0) + 1)
      const depList = dependents.get(dep) ?? []
      depList.push(node.nodeId)
      dependents.set(dep, depList)
    }
  }

  // Kahn's algorithm
  const phases: string[][] = []
  const queue: string[] = Array.from(inDegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)

  const processed = new Set<string>()

  while (queue.length > 0) {
    const phase = [...queue]
    queue.length = 0
    phases.push(phase)
    for (const nodeId of phase) {
      processed.add(nodeId)
      const deps = dependents.get(nodeId) ?? []
      for (const dep of deps) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1
        inDegree.set(dep, newDeg)
        if (newDeg === 0) queue.push(dep)
      }
    }
  }

  const hasCycles = processed.size !== nodeIds.length

  return {
    planId: crypto.randomUUID(),
    workflowId: graph.workflowId,
    phases: hasCycles ? [] : phases,
    totalNodes: nodeIds.length,
    totalPhases: hasCycles ? 0 : phases.length,
    hasCycles,
    resolvedAt: new Date().toISOString(),
  }
}

export function getExecutionOrder(graph: WorkflowGraph): string[] {
  const plan = resolveExecutionPlan(graph)
  return plan.phases.flat()
}

export function canExecuteNode(
  graph: WorkflowGraph,
  nodeId: string,
  completedNodeIds: Set<string>
): boolean {
  const node = graph.nodes.get(nodeId)
  if (!node) return false
  return node.dependencies.every((dep) => completedNodeIds.has(dep))
}
