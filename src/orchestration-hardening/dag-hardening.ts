import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface DAGEdge { from: string; to: string; weight: number }
export interface DAGHardeningResult {
  graphId: string; nodeCount: number; edgeCount: number
  cyclesDetected: number; unreachableNodes: string[]; topologicalOrder: string[]
  hardenedAt: string; passed: boolean; issues: string[]
}

const RESULTS: DAGHardeningResult[] = []
const RESULTS_CAP = 500

function detectCyclesDFS(nodes: string[], edges: DAGEdge[]): { cycles: number; cycleNodes: Set<string> } {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n, [])
  for (const e of edges) {
    const list = adj.get(e.from) ?? []
    list.push(e.to)
    adj.set(e.from, list)
  }
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const cycleNodes = new Set<string>()
  let cycles = 0

  function dfs(node: string): void {
    visited.add(node)
    inStack.add(node)
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor)
      } else if (inStack.has(neighbor)) {
        cycles++
        cycleNodes.add(node)
        cycleNodes.add(neighbor)
      }
    }
    inStack.delete(node)
  }

  for (const n of nodes) {
    if (!visited.has(n)) dfs(n)
  }
  return { cycles, cycleNodes }
}

function kahnTopological(nodes: string[], edges: DAGEdge[]): string[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) { inDegree.set(n, 0); adj.set(n, []) }
  for (const e of edges) {
    adj.get(e.from)!.push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [n, deg] of Array.from(inDegree.entries())) {
    if (deg === 0) queue.push(n)
  }
  const order: string[] = []
  while (queue.length > 0) {
    const node = queue.shift()!
    order.push(node)
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }
  return order.length === nodes.length ? order : []
}

export function hardenDAG(graphId: string, nodes: string[], edges: DAGEdge[]): DAGHardeningResult {
  void isRuntimePaused()
  const { cycles, cycleNodes } = detectCyclesDFS(nodes, edges)
  const topologicalOrder = kahnTopological(nodes, edges)
  const reachableSet = new Set(topologicalOrder)
  const unreachableNodes = cycles > 0 ? nodes.filter(n => !reachableSet.has(n)) : []
  const issues: string[] = []
  if (cycles > 0) issues.push("cycle_detected")
  if (unreachableNodes.length > 0) issues.push("unreachable_nodes")
  void cycleNodes

  const result: DAGHardeningResult = {
    graphId, nodeCount: nodes.length, edgeCount: edges.length,
    cyclesDetected: cycles, unreachableNodes, topologicalOrder,
    hardenedAt: new Date().toISOString(), passed: cycles === 0, issues,
  }
  RESULTS.push(result)
  if (RESULTS.length > RESULTS_CAP) RESULTS.splice(0, RESULTS.length - RESULTS_CAP)
  logger.info("dag-hardening", { graphId, passed: result.passed, cyclesDetected: cycles })
  return result
}

export function getHardeningResult(graphId: string): DAGHardeningResult | undefined {
  return [...RESULTS].reverse().find(r => r.graphId === graphId)
}

export function getFailingGraphs(): DAGHardeningResult[] {
  return RESULTS.filter(r => !r.passed)
}

export function getHardeningSummary(): { total: number; passed: number; failed: number; avgCycles: number } {
  const total = RESULTS.length
  const passed = RESULTS.filter(r => r.passed).length
  const failed = total - passed
  const avgCycles = total > 0 ? RESULTS.reduce((s, r) => s + r.cyclesDetected, 0) / total : 0
  return { total, passed, failed, avgCycles }
}
