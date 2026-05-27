/**
 * Continuity Store — preserves workflow resume context across agent handoffs.
 * Cap: 500 entries (rolling by eviction).
 */

export interface ContinuityRecord {
  id: string;
  workflowId: string;
  tenantId: string;
  lastAgentName: string;
  lastEventType: string;
  resumeContext: Record<string, unknown>;
  savedAt: string;
}

export const CONTINUITY: Map<string, ContinuityRecord> = new Map();
const CAP = 500;

export function saveContinuity(
  workflowId: string,
  tenantId: string,
  lastAgentName: string,
  lastEventType: string,
  resumeContext: Record<string, unknown>
): ContinuityRecord {
  if (!CONTINUITY.has(workflowId) && CONTINUITY.size >= CAP) {
    const oldestKey = CONTINUITY.keys().next().value;
    if (oldestKey !== undefined) {
      CONTINUITY.delete(oldestKey);
    }
  }

  const record: ContinuityRecord = {
    id: crypto.randomUUID(),
    workflowId,
    tenantId,
    lastAgentName,
    lastEventType,
    resumeContext,
    savedAt: new Date().toISOString(),
  };

  CONTINUITY.set(workflowId, record);
  return record;
}

export function loadContinuity(workflowId: string): ContinuityRecord | undefined {
  return CONTINUITY.get(workflowId);
}

export function clearContinuity(workflowId: string): void {
  CONTINUITY.delete(workflowId);
}

export function getActiveContinuities(tenantId?: string): ContinuityRecord[] {
  const all = Array.from(CONTINUITY.values());
  if (!tenantId) return all;
  return all.filter((r) => r.tenantId === tenantId);
}
