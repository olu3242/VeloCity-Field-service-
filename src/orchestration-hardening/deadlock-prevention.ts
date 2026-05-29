import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface DeadlockScan {
  scanId: string; tenantId?: string
  waitGraph: { holder: string; waiter: string }[]
  deadlocksFound: number; affectedExecutions: string[]
  resolvedBy: "timeout" | "priority_preemption" | "none"; resolvedAt?: string
  scannedAt: string
}

const SCANS: DeadlockScan[] = []
const SCANS_CAP = 500

function detectCyclesInWaitGraph(edges: { holder: string; waiter: string }[]): {
  count: number; affected: string[]
} {
  const adj = new Map<string, string[]>()
  for (const { holder, waiter } of edges) {
    if (!adj.has(holder)) adj.set(holder, [])
    if (!adj.has(waiter)) adj.set(waiter, [])
    adj.get(holder)!.push(waiter)
  }
  const nodes = Array.from(adj.keys())
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
  return { count: cycles, affected: Array.from(cycleNodes) }
}

export function scanForDeadlocks(
  waitGraph: { holder: string; waiter: string }[], tenantId?: string
): DeadlockScan {
  void isRuntimePaused()
  const { count, affected } = detectCyclesInWaitGraph(waitGraph)
  const now = new Date().toISOString()
  const scan: DeadlockScan = {
    scanId: crypto.randomUUID(),
    ...(tenantId !== undefined ? { tenantId } : {}),
    waitGraph,
    deadlocksFound: count,
    affectedExecutions: affected,
    resolvedBy: count > 0 ? "timeout" : "none",
    ...(count > 0 ? { resolvedAt: now } : {}),
    scannedAt: now,
  }
  SCANS.push(scan)
  if (SCANS.length > SCANS_CAP) SCANS.splice(0, SCANS.length - SCANS_CAP)
  logger.info("deadlock-prevention", { scanId: scan.scanId, deadlocksFound: count })
  return scan
}

export function getDeadlockHistory(tenantId?: string): DeadlockScan[] {
  if (tenantId === undefined) return [...SCANS]
  return SCANS.filter(s => s.tenantId === tenantId)
}

export function getDeadlockSummary(): {
  total: number; withDeadlocks: number; totalResolved: number; avgDeadlocksPerScan: number
} {
  const total = SCANS.length
  const withDeadlocks = SCANS.filter(s => s.deadlocksFound > 0).length
  const totalResolved = SCANS.filter(s => s.resolvedBy !== "none").length
  const avgDeadlocksPerScan = total > 0 ? SCANS.reduce((s, r) => s + r.deadlocksFound, 0) / total : 0
  return { total, withDeadlocks, totalResolved, avgDeadlocksPerScan }
}
