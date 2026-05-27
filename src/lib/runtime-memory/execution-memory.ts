/**
 * Execution Memory — stores short-lived per-workflow context with TTL.
 * Cap: 2000 entries (rolling by eviction). TTL: 1 hour.
 */

export interface ExecutionMemory {
  id: string;
  workflowId: string;
  tenantId: string;
  agentName: string;
  contextKey: string;
  value: unknown;
  storedAt: string;
  expiresAt: string;
}

export const MEMORY: Map<string, ExecutionMemory> = new Map();
const CAP = 2000;
const TTL_MS = 3_600_000;

function makeKey(workflowId: string, contextKey: string): string {
  return `${workflowId}:${contextKey}`;
}

export function storeMemory(
  workflowId: string,
  tenantId: string,
  agentName: string,
  contextKey: string,
  value: unknown
): ExecutionMemory {
  if (MEMORY.size >= CAP) {
    const oldestKey = MEMORY.keys().next().value;
    if (oldestKey !== undefined) {
      MEMORY.delete(oldestKey);
    }
  }

  const now = new Date();
  const entry: ExecutionMemory = {
    id: crypto.randomUUID(),
    workflowId,
    tenantId,
    agentName,
    contextKey,
    value,
    storedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  };

  MEMORY.set(makeKey(workflowId, contextKey), entry);
  return entry;
}

export function recallMemory(
  workflowId: string,
  contextKey: string
): ExecutionMemory | undefined {
  const entry = MEMORY.get(makeKey(workflowId, contextKey));
  if (!entry) return undefined;
  if (new Date(entry.expiresAt).getTime() <= Date.now()) return undefined;
  return entry;
}

export function evictExpiredMemory(): number {
  const now = Date.now();
  let count = 0;
  for (const [key, entry] of Array.from(MEMORY.entries())) {
    if (new Date(entry.expiresAt).getTime() <= now) {
      MEMORY.delete(key);
      count++;
    }
  }
  return count;
}

export function getWorkflowMemory(workflowId: string): ExecutionMemory[] {
  const now = Date.now();
  return Array.from(MEMORY.values()).filter(
    (e) =>
      e.workflowId === workflowId &&
      new Date(e.expiresAt).getTime() > now
  );
}
