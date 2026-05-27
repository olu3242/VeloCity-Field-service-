/**
 * Unsafe Execution Detector — flags and blocks risky agent actions.
 * Cap: 200 entries (rolling).
 */

export interface UnsafeExecution {
  id: string;
  agentName: string;
  eventType: string;
  tenantId: string;
  reason: string;
  confidence: number;
  detectedAt: string;
  blocked: boolean;
}

export const UNSAFE_LOG: UnsafeExecution[] = [];
const CAP = 200;

const BLOCKED_ACTIONS = ["bulk_delete", "force_approve", "override_governance"];

interface UnsafeContext {
  confidence?: number;
  attemptedAction?: string;
  tenantId?: string;
}

export function detectUnsafeExecution(
  agentName: string,
  eventType: string,
  context: UnsafeContext
): UnsafeExecution | null {
  const { confidence = 1, attemptedAction = "", tenantId = "" } = context;
  const reasons: string[] = [];
  let blocked = false;

  if (confidence < 0.3) {
    reasons.push(`low confidence ${confidence.toFixed(2)} (hallucination risk)`);
  }

  if (confidence < 0.2) {
    blocked = true;
    reasons.push("confidence below 0.2 — execution blocked");
  }

  const hasBlockedAction = BLOCKED_ACTIONS.some((a) =>
    attemptedAction.includes(a)
  );

  if (hasBlockedAction) {
    blocked = true;
    reasons.push(`attempted action "${attemptedAction}" violates governance`);
  }

  if (reasons.length === 0) return null;

  const entry: UnsafeExecution = {
    id: crypto.randomUUID(),
    agentName,
    eventType,
    tenantId,
    reason: reasons.join("; "),
    confidence,
    detectedAt: new Date().toISOString(),
    blocked,
  };

  if (UNSAFE_LOG.length >= CAP) {
    UNSAFE_LOG.splice(0, 1);
  }

  UNSAFE_LOG.push(entry);
  return entry;
}

export function getUnsafeLog(agentName?: string): UnsafeExecution[] {
  if (!agentName) return [...UNSAFE_LOG];
  return UNSAFE_LOG.filter((e) => e.agentName === agentName);
}

export function getBlockedExecutions(): UnsafeExecution[] {
  return UNSAFE_LOG.filter((e) => e.blocked);
}
