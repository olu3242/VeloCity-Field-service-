/**
 * Policy violation tracking.
 */

export interface PolicyViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  agentName: string;
  eventType: string;
  tenantId?: string;
  violationType: "denied" | "approval_bypassed" | "rate_exceeded" | "restricted_action";
  detail: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
}

const VIOLATIONS_CAP = 500;
const VIOLATIONS: PolicyViolation[] = [];

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `viol-${Date.now()}-${idCounter}`;
}

export function recordViolation(
  violation: Omit<PolicyViolation, "id" | "timestamp" | "resolved">
): PolicyViolation {
  if (VIOLATIONS.length >= VIOLATIONS_CAP) VIOLATIONS.shift();

  const full: PolicyViolation = {
    ...violation,
    id: generateId(),
    timestamp: new Date().toISOString(),
    resolved: false,
  };
  VIOLATIONS.push(full);
  return full;
}

export function resolveViolation(id: string): void {
  const v = VIOLATIONS.find((v) => v.id === id);
  if (v !== undefined) {
    v.resolved = true;
    v.resolvedAt = new Date().toISOString();
  }
}

export function getViolationsByAgent(
  agentName: string,
  limit = 20
): PolicyViolation[] {
  return VIOLATIONS.filter((v) => v.agentName === agentName).slice(-limit);
}

export function getViolationsByTenant(
  tenantId: string,
  limit = 20
): PolicyViolation[] {
  return VIOLATIONS.filter((v) => v.tenantId === tenantId).slice(-limit);
}

export function getViolationSummary(): {
  total: number;
  unresolved: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  let unresolved = 0;

  for (const v of VIOLATIONS) {
    if (!v.resolved) unresolved += 1;
    byType[v.violationType] = (byType[v.violationType] ?? 0) + 1;
    byAgent[v.agentName] = (byAgent[v.agentName] ?? 0) + 1;
  }

  return { total: VIOLATIONS.length, unresolved, byType, byAgent };
}
