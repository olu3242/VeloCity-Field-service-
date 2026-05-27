/**
 * Workflow State — in-memory tracking of workflow lifecycle states.
 * Cap: 1000 entries (rolling).
 */

import { isRuntimePaused } from "@/lib/governance/operator";
import { assertTenantIsolation } from "@/lib/governance/tenant";

export interface WorkflowState {
  id: string;
  workflowType: string;
  tenantId: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  currentStep: number;
  totalSteps: number;
  startedAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export const WORKFLOW_STATES: Map<string, WorkflowState> = new Map();
const CAP = 1000;

function enforceWorkflowCap(): void {
  if (WORKFLOW_STATES.size >= CAP) {
    const keys = Array.from(WORKFLOW_STATES.keys());
    WORKFLOW_STATES.delete(keys[0]);
  }
}

export function createWorkflowState(
  workflowType: string,
  tenantId: string,
  totalSteps: number,
  metadata: Record<string, unknown> = {}
): WorkflowState {
  assertTenantIsolation(tenantId, tenantId);
  enforceWorkflowCap();

  const now = new Date().toISOString();
  const workflow: WorkflowState = {
    id: crypto.randomUUID(),
    workflowType,
    tenantId,
    status: "pending",
    currentStep: 0,
    totalSteps,
    startedAt: now,
    updatedAt: now,
    metadata,
  };

  WORKFLOW_STATES.set(workflow.id, workflow);
  return workflow;
}

export function updateWorkflowState(
  id: string,
  update: Partial<Pick<WorkflowState, "status" | "currentStep" | "metadata">>
): void {
  if (isRuntimePaused()) return;

  const existing = WORKFLOW_STATES.get(id);
  if (!existing) return;

  const updated: WorkflowState = {
    ...existing,
    ...update,
    updatedAt: new Date().toISOString(),
  };

  WORKFLOW_STATES.set(id, updated);
}

export function getWorkflowState(id: string): WorkflowState | undefined {
  return WORKFLOW_STATES.get(id);
}

export function getWorkflowsByTenant(tenantId: string): WorkflowState[] {
  return Array.from(WORKFLOW_STATES.values()).filter(
    (w) => w.tenantId === tenantId
  );
}

export function getWorkflowsByStatus(
  status: WorkflowState["status"]
): WorkflowState[] {
  return Array.from(WORKFLOW_STATES.values()).filter(
    (w) => w.status === status
  );
}
