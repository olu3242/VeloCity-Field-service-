/**
 * Execution checkpointing for workflow resume after failure or interruption.
 */

export interface ExecutionCheckpoint {
  id: string;
  workflowId: string;
  tenantId?: string;
  stepIndex: number;
  totalSteps: number;
  state: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  resumed: boolean;
  resumedAt?: string;
}

const CHECKPOINTS: Map<string, ExecutionCheckpoint> = new Map();
const MAX_CHECKPOINTS = 500;
const CHECKPOINT_TTL_MS = 3_600_000;

export function saveCheckpoint(
  workflowId: string,
  stepIndex: number,
  totalSteps: number,
  state: Record<string, unknown>,
  tenantId?: string,
): ExecutionCheckpoint {
  const { randomUUID } = crypto;
  const now = Date.now();
  const checkpoint: ExecutionCheckpoint = {
    id: randomUUID(),
    workflowId,
    tenantId,
    stepIndex,
    totalSteps,
    state,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CHECKPOINT_TTL_MS).toISOString(),
    resumed: false,
  };

  // Enforce cap: evict oldest if at limit and this is a new workflowId
  if (!CHECKPOINTS.has(workflowId) && CHECKPOINTS.size >= MAX_CHECKPOINTS) {
    const firstKey = CHECKPOINTS.keys().next().value as string;
    CHECKPOINTS.delete(firstKey);
  }

  CHECKPOINTS.set(workflowId, checkpoint);
  return checkpoint;
}

export function loadCheckpoint(workflowId: string): ExecutionCheckpoint | undefined {
  const cp = CHECKPOINTS.get(workflowId);
  if (!cp) return undefined;
  if (Date.now() > new Date(cp.expiresAt).getTime()) {
    CHECKPOINTS.delete(workflowId);
    return undefined;
  }
  return cp;
}

export function markResumed(workflowId: string): void {
  const cp = CHECKPOINTS.get(workflowId);
  if (!cp) return;
  cp.resumed = true;
  cp.resumedAt = new Date().toISOString();
}

export function expireCheckpoints(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, cp] of Array.from(CHECKPOINTS.entries())) {
    if (now > new Date(cp.expiresAt).getTime()) {
      CHECKPOINTS.delete(key);
      removed++;
    }
  }
  return removed;
}

export function getActiveCheckpoints(tenantId?: string): ExecutionCheckpoint[] {
  const now = Date.now();
  return Array.from(CHECKPOINTS.values()).filter(
    (cp) =>
      now <= new Date(cp.expiresAt).getTime() &&
      (tenantId === undefined || cp.tenantId === tenantId),
  );
}
