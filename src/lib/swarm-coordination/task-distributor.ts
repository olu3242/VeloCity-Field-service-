import { getAvailableAgents, SwarmAgent } from "./swarm-registry"

export interface SwarmTask {
  id: string
  taskType: string
  tenantId?: string
  assignedAgentId?: string
  priority: number
  status: "unassigned" | "assigned" | "executing" | "completed" | "failed"
  createdAt: string
  assignedAt?: string
  completedAt?: string
}

const TASKS: SwarmTask[] = []
const TASK_CAP = 500

export function createTask(taskType: string, priority: number, tenantId?: string): SwarmTask {
  const task: SwarmTask = {
    id: crypto.randomUUID(),
    taskType,
    tenantId,
    priority,
    status: "unassigned",
    createdAt: new Date().toISOString(),
  }
  TASKS.push(task)
  if (TASKS.length > TASK_CAP) TASKS.splice(0, TASKS.length - TASK_CAP)
  return task
}

export function assignTask(taskId: string, agentId: string): void {
  const task = TASKS.find((t) => t.id === taskId)
  if (!task) return
  task.assignedAgentId = agentId
  task.status = "assigned"
  task.assignedAt = new Date().toISOString()
}

export function completeTask(taskId: string, status: "completed" | "failed"): void {
  const task = TASKS.find((t) => t.id === taskId)
  if (!task) return
  task.status = status
  task.completedAt = new Date().toISOString()
}

export function getUnassignedTasks(): SwarmTask[] {
  return TASKS.filter((t) => t.status === "unassigned")
}

export function distributeToLeastLoaded(taskId: string): SwarmAgent | null {
  const available = getAvailableAgents()
  if (available.length === 0) return null
  const agent = available.reduce((min, a) => a.currentLoad < min.currentLoad ? a : min)
  assignTask(taskId, agent.agentId)
  return agent
}

export function getSwarmThroughput(): {
  total: number
  completed: number
  failed: number
  successRate: number
  avgCycleMs: number
} {
  const total = TASKS.length
  const completed = TASKS.filter((t) => t.status === "completed").length
  const failed = TASKS.filter((t) => t.status === "failed").length
  const done = completed + failed
  const successRate = done > 0 ? completed / done : 0
  const withCycle = TASKS.filter((t) => t.completedAt && t.createdAt)
  const avgCycleMs = withCycle.length > 0
    ? withCycle.reduce((s, t) => s + (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()), 0) / withCycle.length
    : 0
  return { total, completed, failed, successRate, avgCycleMs }
}
