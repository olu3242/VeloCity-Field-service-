// Autonomous Executor — schedules and tracks governed autonomous tasks.
// Every task references an approved GovernanceProposal.

import { markProposalExecuted } from "./governance-protocol";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AutonomousTask {
  id: string;
  proposalId: string;
  taskType: string;
  assignedAgent: string;
  tenantId?: string;
  priority: number;
  status: TaskStatus;
  outcome?: string;
  durationMs?: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
}

const TASKS: AutonomousTask[] = [];
const CAP = 300;

export function scheduleAutonomousTask(params: {
  proposalId: string;
  taskType: string;
  assignedAgent: string;
  tenantId?: string;
  priority?: number;
}): AutonomousTask {
  const task: AutonomousTask = {
    id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    proposalId: params.proposalId,
    taskType: params.taskType,
    assignedAgent: params.assignedAgent,
    tenantId: params.tenantId,
    priority: params.priority ?? 5,
    status: "queued",
    queuedAt: new Date().toISOString(),
  };
  if (TASKS.length >= CAP) TASKS.shift();
  TASKS.push(task);
  return task;
}

export function startTask(taskId: string): void {
  const task = TASKS.find(t => t.id === taskId);
  if (!task || task.status !== "queued") return;
  task.status = "running";
  task.startedAt = new Date().toISOString();
  markProposalExecuted(task.proposalId);
}

export function completeTask(taskId: string, outcome: string): void {
  const task = TASKS.find(t => t.id === taskId);
  if (!task) return;
  task.status = "completed";
  task.outcome = outcome;
  task.completedAt = new Date().toISOString();
  if (task.startedAt) task.durationMs = Date.now() - new Date(task.startedAt).getTime();
}

export function failTask(taskId: string, reason: string): void {
  const task = TASKS.find(t => t.id === taskId);
  if (!task) return;
  task.status = "failed";
  task.outcome = reason;
  task.completedAt = new Date().toISOString();
}

export function cancelTask(taskId: string): void {
  const task = TASKS.find(t => t.id === taskId);
  if (!task || task.status === "running") return;
  task.status = "cancelled";
  task.completedAt = new Date().toISOString();
}

export function getTaskQueue(tenantId?: string): AutonomousTask[] {
  return TASKS.filter(t => t.status === "queued" && (!tenantId || t.tenantId === tenantId))
    .sort((a, b) => b.priority - a.priority);
}

export function getRunningTasks(): AutonomousTask[] {
  return TASKS.filter(t => t.status === "running");
}

export function getCompletedTasks(limit = 20): AutonomousTask[] {
  return [...TASKS].filter(t => t.status === "completed" || t.status === "failed")
    .reverse().slice(0, limit);
}

export function getExecutorStats() {
  const done = TASKS.filter(t => typeof t.durationMs === "number");
  return {
    total: TASKS.length,
    queued: TASKS.filter(t => t.status === "queued").length,
    running: TASKS.filter(t => t.status === "running").length,
    completed: TASKS.filter(t => t.status === "completed").length,
    failed: TASKS.filter(t => t.status === "failed").length,
    avgDurationMs: done.length ? Math.round(done.reduce((s, t) => s + (t.durationMs ?? 0), 0) / done.length) : 0,
  };
}
