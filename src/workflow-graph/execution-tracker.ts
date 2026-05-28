import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type NodeExecutionStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "compensating"

export interface NodeExecution {
  nodeExecutionId: string
  workflowId: string
  nodeId: string
  executionId: string
  tenantId?: string
  status: NodeExecutionStatus
  startedAt?: string
  completedAt?: string
  durationMs?: number
  attempt: number
  error?: string
}

// keyed by workflowId, total entry cap 2000
const EXECUTIONS = new Map<string, NodeExecution[]>()
const TOTAL_CAP = 2000

function totalEntries(): number {
  return Array.from(EXECUTIONS.values()).reduce((sum, arr) => sum + arr.length, 0)
}

function evictOldestEntry(): void {
  for (const [key, arr] of Array.from(EXECUTIONS.entries())) {
    if (arr.length > 0) {
      arr.shift()
      if (arr.length === 0) EXECUTIONS.delete(key)
      return
    }
  }
}

export function startNodeExecution(
  workflowId: string,
  nodeId: string,
  executionId: string,
  tenantId?: string
): NodeExecution {
  if (isRuntimePaused()) {
    logger.warn("startNodeExecution blocked — runtime paused", "execution-tracker", { workflowId, nodeId })
    throw new Error("Runtime is paused")
  }
  while (totalEntries() >= TOTAL_CAP) evictOldestEntry()
  const existing = EXECUTIONS.get(workflowId) ?? []
  const prevAttempts = existing.filter((e) => e.nodeId === nodeId).length
  const entry: NodeExecution = {
    nodeExecutionId: crypto.randomUUID(),
    workflowId,
    nodeId,
    executionId,
    tenantId,
    status: "running",
    startedAt: new Date().toISOString(),
    attempt: prevAttempts + 1,
  }
  existing.push(entry)
  EXECUTIONS.set(workflowId, existing)
  return entry
}

function findEntry(nodeExecutionId: string): NodeExecution | undefined {
  for (const arr of Array.from(EXECUTIONS.values())) {
    const found = arr.find((e) => e.nodeExecutionId === nodeExecutionId)
    if (found) return found
  }
  return undefined
}

export function completeNode(nodeExecutionId: string): void {
  const entry = findEntry(nodeExecutionId)
  if (!entry) return
  entry.status = "completed"
  entry.completedAt = new Date().toISOString()
  if (entry.startedAt) {
    entry.durationMs = new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()
  }
}

export function failNode(nodeExecutionId: string, error: string): void {
  const entry = findEntry(nodeExecutionId)
  if (!entry) return
  entry.status = "failed"
  entry.completedAt = new Date().toISOString()
  entry.error = error
  if (entry.startedAt) {
    entry.durationMs = new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()
  }
}

export function getWorkflowProgress(
  workflowId: string
): { total: number; completed: number; failed: number; running: number; pending: number } {
  const entries = EXECUTIONS.get(workflowId) ?? []
  let completed = 0; let failed = 0; let running = 0; let pending = 0
  for (const e of entries) {
    if (e.status === "completed") completed++
    else if (e.status === "failed") failed++
    else if (e.status === "running") running++
    else pending++
  }
  return { total: entries.length, completed, failed, running, pending }
}

export function getNodeExecutionHistory(workflowId: string, nodeId: string): NodeExecution[] {
  return (EXECUTIONS.get(workflowId) ?? []).filter((e) => e.nodeId === nodeId)
}
