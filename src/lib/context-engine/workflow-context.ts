/**
 * Workflow Context — per-workflow context with lineage tracking.
 */

export interface WorkflowContext {
  id: string;
  workflowId: string;
  tenantId: string;
  eventType: string;
  agentName?: string;
  contextPayload: Record<string, unknown>;
  lineageIds: string[];
  createdAt: string;
}

const WORKFLOW_CONTEXTS: Map<string, WorkflowContext> = new Map();
const CAP = 1000;

function evictIfFull(): void {
  if (WORKFLOW_CONTEXTS.size >= CAP) {
    const firstKey = Array.from(WORKFLOW_CONTEXTS.keys())[0];
    if (firstKey !== undefined) WORKFLOW_CONTEXTS.delete(firstKey);
  }
}

export function createWorkflowContext(
  workflowId: string,
  tenantId: string,
  eventType: string,
  contextPayload: Record<string, unknown>,
  parentWorkflowId?: string
): WorkflowContext {
  evictIfFull();
  let lineageIds: string[] = [];
  if (parentWorkflowId !== undefined) {
    const parent = WORKFLOW_CONTEXTS.get(parentWorkflowId);
    if (parent) {
      lineageIds = [...parent.lineageIds, parentWorkflowId];
    }
  }
  const ctx: WorkflowContext = {
    id: crypto.randomUUID(),
    workflowId,
    tenantId,
    eventType,
    contextPayload,
    lineageIds,
    createdAt: new Date().toISOString(),
  };
  WORKFLOW_CONTEXTS.set(workflowId, ctx);
  return ctx;
}

export function updateWorkflowContext(
  workflowId: string,
  patch: Record<string, unknown>
): void {
  const ctx = WORKFLOW_CONTEXTS.get(workflowId);
  if (!ctx) return;
  WORKFLOW_CONTEXTS.set(workflowId, {
    ...ctx,
    contextPayload: { ...ctx.contextPayload, ...patch },
  });
}

export function getWorkflowContext(workflowId: string): WorkflowContext | undefined {
  return WORKFLOW_CONTEXTS.get(workflowId);
}

export function getContextLineage(workflowId: string): WorkflowContext[] {
  const ctx = WORKFLOW_CONTEXTS.get(workflowId);
  if (!ctx) return [];
  return ctx.lineageIds
    .map((id) => WORKFLOW_CONTEXTS.get(id))
    .filter((c): c is WorkflowContext => c !== undefined);
}
