import { WorkflowGraph, GraphNode } from "./graph-types"
import { resolveExecutionPlan } from "./dependency-resolver"

export type SimulationEventType =
  | "node_started"
  | "node_completed"
  | "node_failed"
  | "edge_traversed"
  | "cycle_detected"
  | "timeout_predicted"

export interface SimulationEvent {
  eventId: string
  eventType: SimulationEventType
  nodeId?: string
  edgeId?: string
  simulatedAt: string
  metadata: Record<string, unknown>
}

export interface SimulationResult {
  simulationId: string
  workflowId: string
  success: boolean
  criticalPath: string[]
  estimatedDurationMs: number
  riskNodes: string[]
  events: SimulationEvent[]
  simulatedAt: string
}

function makeEvent(
  type: SimulationEventType,
  metadata: Record<string, unknown>,
  nodeId?: string,
  edgeId?: string
): SimulationEvent {
  return { eventId: crypto.randomUUID(), eventType: type, nodeId, edgeId, simulatedAt: new Date().toISOString(), metadata }
}

function nodeDurationMs(node: GraphNode): number {
  return node.nodeType === "gateway" || node.nodeType === "join" ? 100 : 500
}

function isRiskNode(node: GraphNode): boolean {
  return !node.retryPolicy || node.retryPolicy.maxAttempts > 3
}

function computeCriticalPath(graph: WorkflowGraph, order: string[]): string[] {
  // Longest chain by duration using dynamic programming on topological order
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  for (const nodeId of order) {
    dist.set(nodeId, 0)
    prev.set(nodeId, null)
  }
  for (const nodeId of order) {
    const node = graph.nodes.get(nodeId)
    if (!node) continue
    const current = dist.get(nodeId) ?? 0
    for (const outputId of node.outputs) {
      const outputNode = graph.nodes.get(outputId)
      if (!outputNode) continue
      const candidate = current + nodeDurationMs(node)
      if (candidate > (dist.get(outputId) ?? 0)) {
        dist.set(outputId, candidate)
        prev.set(outputId, nodeId)
      }
    }
  }
  // Find end node with max dist
  let endId = order[order.length - 1] ?? ""
  let maxDist = dist.get(endId) ?? 0
  for (const [id, d] of Array.from(dist.entries())) {
    if (d > maxDist) { maxDist = d; endId = id }
  }
  // Trace back
  const path: string[] = []
  let current: string | null | undefined = endId
  while (current !== null && current !== undefined) {
    path.unshift(current)
    current = prev.get(current) ?? null
  }
  return path
}

export function simulateGraph(
  graph: WorkflowGraph,
  options?: { failureRatePct?: number }
): SimulationResult {
  const plan = resolveExecutionPlan(graph)
  const events: SimulationEvent[] = []
  const simulatedAt = new Date().toISOString()

  if (plan.hasCycles) {
    events.push(makeEvent("cycle_detected", { workflowId: graph.workflowId }))
    return {
      simulationId: crypto.randomUUID(),
      workflowId: graph.workflowId,
      success: false,
      criticalPath: [],
      estimatedDurationMs: 0,
      riskNodes: [],
      events,
      simulatedAt,
    }
  }

  const failureRate = options?.failureRatePct ?? 0
  const order = plan.phases.flat()
  const riskNodes: string[] = []
  let estimatedDurationMs = 0

  for (const nodeId of order) {
    const node = graph.nodes.get(nodeId)
    if (!node) continue
    events.push(makeEvent("node_started", { nodeType: node.nodeType }, nodeId))
    const dur = nodeDurationMs(node)
    const failed = failureRate > 0 && Math.random() * 100 < failureRate
    if (isRiskNode(node)) riskNodes.push(nodeId)
    if (node.timeoutMs !== undefined && dur > node.timeoutMs) {
      events.push(makeEvent("timeout_predicted", { estimatedMs: dur, timeoutMs: node.timeoutMs }, nodeId))
    }
    if (failed) {
      events.push(makeEvent("node_failed", { reason: "simulated_failure" }, nodeId))
    } else {
      events.push(makeEvent("node_completed", { durationMs: dur }, nodeId))
    }
    for (const edge of graph.edges.filter((e) => e.fromNodeId === nodeId)) {
      events.push(makeEvent("edge_traversed", { edgeType: edge.edgeType }, undefined, edge.edgeId))
    }
    estimatedDurationMs += dur
  }

  const criticalPath = computeCriticalPath(graph, order)

  return {
    simulationId: crypto.randomUUID(),
    workflowId: graph.workflowId,
    success: true,
    criticalPath,
    estimatedDurationMs,
    riskNodes,
    events,
    simulatedAt,
  }
}
