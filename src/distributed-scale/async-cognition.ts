import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface CognitionTask {
  taskId: string
  domain: string
  tenantId?: string
  priority: "low" | "normal" | "high" | "critical"
  payload: Record<string, unknown>
  status: "queued" | "processing" | "completed" | "failed" | "timeout"
  queuedAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  result?: Record<string, unknown>
}

const PIPELINE: CognitionTask[] = []
const ROLLING_CAP = 2000
export const MAX_CONCURRENT = 20

export function enqueueCognitionTask(
  domain: string,
  priority: CognitionTask["priority"],
  payload: Record<string, unknown>,
  tenantId?: string
): CognitionTask {
  if (isRuntimePaused()) {
    logger.warn("enqueueCognitionTask blocked: runtime paused", { domain })
    throw new Error("Runtime is paused")
  }
  const task: CognitionTask = {
    taskId: crypto.randomUUID(),
    domain,
    tenantId,
    priority,
    payload,
    status: "queued",
    queuedAt: new Date().toISOString(),
  }
  PIPELINE.push(task)
  if (PIPELINE.length > ROLLING_CAP) PIPELINE.shift()
  return task
}

export function startTask(taskId: string): void {
  const task = PIPELINE.find((t) => t.taskId === taskId)
  if (!task) return
  task.status = "processing"
  task.startedAt = new Date().toISOString()
}

export function completeTask(
  taskId: string,
  result: Record<string, unknown>
): void {
  const task = PIPELINE.find((t) => t.taskId === taskId)
  if (!task) return
  task.status = "completed"
  task.completedAt = new Date().toISOString()
  task.result = result
  if (task.startedAt) {
    task.durationMs =
      new Date(task.completedAt).getTime() -
      new Date(task.startedAt).getTime()
  }
}

export function failTask(taskId: string): void {
  const task = PIPELINE.find((t) => t.taskId === taskId)
  if (!task) return
  task.status = "failed"
}

export function timeoutStale(timeoutMs = 30000): number {
  const now = Date.now()
  let count = 0
  for (const task of PIPELINE) {
    if (task.status === "processing" && task.startedAt) {
      if (now - new Date(task.startedAt).getTime() > timeoutMs) {
        task.status = "timeout"
        count++
      }
    }
  }
  return count
}

export function getQueuedTasks(
  domain?: string,
  priority?: CognitionTask["priority"]
): CognitionTask[] {
  return PIPELINE.filter(
    (t) =>
      t.status === "queued" &&
      (domain === undefined || t.domain === domain) &&
      (priority === undefined || t.priority === priority)
  )
}

export function getPipelineSummary(): {
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
  timeout: number
  avgDurationMs: number
} {
  const total = PIPELINE.length
  const queued = PIPELINE.filter((t) => t.status === "queued").length
  const processing = PIPELINE.filter((t) => t.status === "processing").length
  const completed = PIPELINE.filter((t) => t.status === "completed").length
  const failed = PIPELINE.filter((t) => t.status === "failed").length
  const timeout = PIPELINE.filter((t) => t.status === "timeout").length
  const completedWithDuration = PIPELINE.filter(
    (t) => t.status === "completed" && t.durationMs !== undefined
  )
  const avgDurationMs =
    completedWithDuration.length > 0
      ? completedWithDuration.reduce((s, t) => s + (t.durationMs ?? 0), 0) /
        completedWithDuration.length
      : 0
  return { total, queued, processing, completed, failed, timeout, avgDurationMs }
}
