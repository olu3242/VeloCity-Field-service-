/**
 * Priority-based runtime scheduler — manages execution slots and task queue.
 */

import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export type SchedulerPriority = "critical" | "high" | "normal" | "low"

export interface ScheduledTask {
  taskId: string
  executionId: string
  priority: SchedulerPriority
  scheduledAt: string
  scheduledFor?: string
  status: "queued" | "running" | "completed" | "cancelled" | "timeout"
  tenantId?: string
  workflowType: string
  attempt: number
}

const TASK_QUEUE: Map<string, ScheduledTask> = new Map()
const QUEUE_CAP = 5000

interface ScheduleOptions {
  scheduledFor?: string
  tenantId?: string
  attempt?: number
}

export function scheduleTask(
  executionId: string,
  workflowType: string,
  priority: SchedulerPriority,
  options?: ScheduleOptions
): ScheduledTask {
  if (TASK_QUEUE.size >= QUEUE_CAP) {
    const firstKey = Array.from(TASK_QUEUE.keys())[0]
    if (firstKey !== undefined) TASK_QUEUE.delete(firstKey)
  }
  const task: ScheduledTask = {
    taskId: crypto.randomUUID(),
    executionId,
    priority,
    scheduledAt: new Date().toISOString(),
    scheduledFor: options?.scheduledFor,
    status: "queued",
    tenantId: options?.tenantId,
    workflowType,
    attempt: options?.attempt ?? 1,
  }
  TASK_QUEUE.set(task.taskId, task)
  logger.debug(`Task queued: ${task.taskId}`, "scheduler", { metadata: { priority, workflowType } })
  return task
}

export function markRunning(taskId: string): void {
  if (isRuntimePaused()) {
    logger.warn("markRunning blocked — runtime paused", "scheduler", { metadata: { taskId } })
    return
  }
  const task = TASK_QUEUE.get(taskId)
  if (task) task.status = "running"
}

export function completeTask(taskId: string): void {
  const task = TASK_QUEUE.get(taskId)
  if (task) task.status = "completed"
}

export function cancelTask(taskId: string): void {
  const task = TASK_QUEUE.get(taskId)
  if (task) task.status = "cancelled"
}

export function getQueueDepth(priority?: SchedulerPriority): number {
  const tasks = Array.from(TASK_QUEUE.values())
  const queued = tasks.filter((t) => t.status === "queued")
  if (!priority) return queued.length
  return queued.filter((t) => t.priority === priority).length
}

export function getSchedulerStats(): {
  queued: number
  running: number
  completed: number
  cancelled: number
  byPriority: Record<string, number>
} {
  const tasks = Array.from(TASK_QUEUE.values())
  const byPriority: Record<string, number> = { critical: 0, high: 0, normal: 0, low: 0 }
  for (const t of tasks) {
    if (t.status === "queued") byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1
  }
  return {
    queued: tasks.filter((t) => t.status === "queued").length,
    running: tasks.filter((t) => t.status === "running").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
    byPriority,
  }
}
