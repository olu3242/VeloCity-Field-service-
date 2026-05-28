import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface DistributedCognitionTask {
  taskId: string
  taskType: string
  assignedNodeId: string
  tenantId?: string
  input: Record<string, unknown>
  result?: Record<string, unknown>
  confidence?: number
  status: "assigned" | "processing" | "completed" | "failed" | "timeout"
  assignedAt: string
  completedAt?: string
  timeoutAt: string
}

const TASKS: Map<string, DistributedCognitionTask> = new Map()
const MAX_TASKS = 2000

export function assignTask(
  taskType: string,
  nodeId: string,
  input: Record<string, unknown>,
  tenantId?: string,
): DistributedCognitionTask {
  if (isRuntimePaused()) {
    logger.warn("assignTask blocked: runtime paused", "distributed-cognition")
    throw new Error("Runtime is paused")
  }

  if (TASKS.size >= MAX_TASKS) {
    const firstKey = Array.from(TASKS.keys())[0]
    if (firstKey !== undefined) TASKS.delete(firstKey)
  }

  const now = new Date()
  const task: DistributedCognitionTask = {
    taskId: crypto.randomUUID(),
    taskType,
    assignedNodeId: nodeId,
    tenantId,
    input,
    status: "assigned",
    assignedAt: now.toISOString(),
    timeoutAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
  }

  TASKS.set(task.taskId, task)
  logger.info(`Task assigned: ${taskType} → ${nodeId}`, "distributed-cognition", {
    tenantId, metadata: { taskId: task.taskId },
  })
  return task
}

export function completeTask(taskId: string, result: Record<string, unknown>, confidence: number): void {
  const task = TASKS.get(taskId)
  if (task) {
    task.status = "completed"
    task.result = result
    task.confidence = confidence
    task.completedAt = new Date().toISOString()
    TASKS.set(taskId, task)
  }
}

export function failTask(taskId: string): void {
  const task = TASKS.get(taskId)
  if (task) {
    task.status = "failed"
    task.completedAt = new Date().toISOString()
    TASKS.set(taskId, task)
  }
}

export function expireTimedOut(): number {
  const now = new Date().toISOString()
  let count = 0
  for (const [id, task] of Array.from(TASKS.entries())) {
    if ((task.status === "assigned" || task.status === "processing") && task.timeoutAt <= now) {
      task.status = "timeout"
      task.completedAt = new Date().toISOString()
      TASKS.set(id, task)
      count += 1
    }
  }
  return count
}

export function getTasksByNode(nodeId: string): DistributedCognitionTask[] {
  return Array.from(TASKS.values()).filter((t) => t.assignedNodeId === nodeId)
}

export function getTaskStats(): {
  total: number
  completed: number
  failed: number
  timeout: number
  avgConfidence: number
} {
  const values = Array.from(TASKS.values())
  const total = values.length
  let completed = 0, failed = 0, timeout = 0, totalConf = 0, confCount = 0
  for (const t of values) {
    if (t.status === "completed") { completed++; if (t.confidence !== undefined) { totalConf += t.confidence; confCount++ } }
    else if (t.status === "failed") failed++
    else if (t.status === "timeout") timeout++
  }
  return { total, completed, failed, timeout, avgConfidence: confCount > 0 ? totalConf / confCount : 0 }
}
