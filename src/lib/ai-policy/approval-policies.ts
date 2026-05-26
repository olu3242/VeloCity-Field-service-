/**
 * Escalation approval policy management.
 */

export interface ApprovalPolicy {
  policyId: string;
  name: string;
  agentName?: string;
  eventType?: string;
  triggerCondition: string;
  approvalTimeoutMs: number;
  defaultOnTimeout: "approve" | "deny";
  notifyChannel: string;
}

export interface PendingApproval {
  id: string;
  policyId: string;
  agentName: string;
  eventType: string;
  context: Record<string, unknown>;
  tenantId?: string;
  requestedAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "denied" | "expired";
  resolvedBy?: string;
  resolvedAt?: string;
}

const PENDING_CAP = 100;

const POLICIES: ApprovalPolicy[] = [
  {
    policyId: "large-payout-approval",
    name: "Large Payout Approval",
    agentName: "FINN",
    eventType: "payout_released",
    triggerCondition: "amount > 50000",
    approvalTimeoutMs: 300_000,
    defaultOnTimeout: "deny",
    notifyChannel: "pager",
  },
  {
    policyId: "bulk-action-approval",
    name: "Bulk Action Approval",
    agentName: undefined,
    eventType: undefined,
    triggerCondition: "bulk operation",
    approvalTimeoutMs: 600_000,
    defaultOnTimeout: "deny",
    notifyChannel: "slack",
  },
];

const PENDING = new Map<string, PendingApproval>();

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `appr-${Date.now()}-${idCounter}`;
}

export function requestApproval(
  policyId: string,
  agentName: string,
  eventType: string,
  context: Record<string, unknown>,
  tenantId?: string
): PendingApproval {
  const policy = POLICIES.find((p) => p.policyId === policyId);
  if (policy === undefined) {
    throw new Error(`Unknown approval policy: ${policyId}`);
  }

  // Enforce cap: remove oldest pending entry if at cap
  if (PENDING.size >= PENDING_CAP) {
    const oldestKey = Array.from(PENDING.keys())[0];
    if (oldestKey !== undefined) PENDING.delete(oldestKey);
  }

  const now = Date.now();
  const approval: PendingApproval = {
    id: generateId(),
    policyId,
    agentName,
    eventType,
    context,
    tenantId,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + policy.approvalTimeoutMs).toISOString(),
    status: "pending",
  };

  PENDING.set(approval.id, approval);
  return approval;
}

export function resolveApproval(
  id: string,
  status: "approved" | "denied",
  resolvedBy: string
): void {
  const approval = PENDING.get(id);
  if (approval === undefined) return;
  approval.status = status;
  approval.resolvedBy = resolvedBy;
  approval.resolvedAt = new Date().toISOString();
}

export function expireStaleApprovals(): number {
  const now = new Date().toISOString();
  let count = 0;

  for (const approval of Array.from(PENDING.values())) {
    if (approval.status !== "pending") continue;
    if (approval.expiresAt < now) {
      const policy = POLICIES.find((p) => p.policyId === approval.policyId);
      const timeout = policy?.defaultOnTimeout ?? "deny";
      approval.status = timeout === "approve" ? "approved" : "denied";
      approval.resolvedAt = new Date().toISOString();
      count += 1;
    }
  }

  return count;
}

export function getPendingApprovals(agentName?: string): PendingApproval[] {
  const all = Array.from(PENDING.values()).filter(
    (a) => a.status === "pending"
  );
  if (agentName === undefined) return all;
  return all.filter((a) => a.agentName === agentName);
}
