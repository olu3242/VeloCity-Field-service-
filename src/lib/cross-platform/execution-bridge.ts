/**
 * Execution Bridge — orchestrates cross-platform workflow executions.
 * Cap: 100 executions. Blocked when runtime is paused.
 */

import { isRuntimePaused } from "@/lib/governance/operator";

export interface CrossPlatformExecution {
  id: string;
  sourcePlatform: string;
  targetPlatform: string;
  workflowId: string;
  status: "initiated" | "in_progress" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  tenantId: string;
}

const EXECUTIONS_CAP = 100;
export const EXECUTIONS: CrossPlatformExecution[] = [];

export function initiateExecution(
  sourcePlatform: string,
  targetPlatform: string,
  workflowId: string,
  tenantId: string
): CrossPlatformExecution {
  if (EXECUTIONS.length >= EXECUTIONS_CAP) {
    EXECUTIONS.shift();
  }
  if (isRuntimePaused()) {
    const execution: CrossPlatformExecution = {
      id: crypto.randomUUID(),
      sourcePlatform,
      targetPlatform,
      workflowId: `PAUSED:${workflowId}`,
      status: "failed",
      startedAt: new Date().toISOString(),
      tenantId,
    };
    EXECUTIONS.push(execution);
    return execution;
  }
  const execution: CrossPlatformExecution = {
    id: crypto.randomUUID(),
    sourcePlatform,
    targetPlatform,
    workflowId,
    status: "initiated",
    startedAt: new Date().toISOString(),
    tenantId,
  };
  EXECUTIONS.push(execution);
  return execution;
}

export function updateExecutionStatus(
  id: string,
  status: CrossPlatformExecution["status"]
): void {
  const execution = EXECUTIONS.find((e) => e.id === id);
  if (!execution) return;
  execution.status = status;
  if (status === "completed" || status === "failed") {
    execution.completedAt = new Date().toISOString();
  }
}

export function getActiveExecutions(
  tenantId?: string
): CrossPlatformExecution[] {
  const active = EXECUTIONS.filter(
    (e) => e.status === "initiated" || e.status === "in_progress"
  );
  return tenantId ? active.filter((e) => e.tenantId === tenantId) : active;
}

export function getExecutionById(
  id: string
): CrossPlatformExecution | undefined {
  return EXECUTIONS.find((e) => e.id === id);
}
