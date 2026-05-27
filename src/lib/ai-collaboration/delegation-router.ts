import { isRuntimePaused } from "@/lib/governance/operator";

export interface DelegationRecord {
  id: string;
  fromAgent: string;
  toAgent: string;
  tenantId: string;
  taskType: string;
  reason: string;
  status: "pending" | "accepted" | "rejected" | "completed";
  delegatedAt: string;
  resolvedAt?: string;
}

export const DELEGATIONS: DelegationRecord[] = [];
const CAP = 300;

export function delegate(
  fromAgent: string,
  toAgent: string,
  tenantId: string,
  taskType: string,
  reason: string
): DelegationRecord {
  const record: DelegationRecord = {
    id: crypto.randomUUID(),
    fromAgent,
    toAgent,
    tenantId,
    taskType,
    reason,
    status: isRuntimePaused() ? "rejected" : "pending",
    delegatedAt: new Date().toISOString(),
  };
  if (isRuntimePaused()) {
    record.resolvedAt = new Date().toISOString();
  }
  DELEGATIONS.push(record);
  if (DELEGATIONS.length > CAP) DELEGATIONS.shift();
  return record;
}

export function resolveDelegate(
  id: string,
  status: "accepted" | "rejected" | "completed"
): void {
  const rec = DELEGATIONS.find((d) => d.id === id);
  if (!rec) return;
  rec.status = status;
  rec.resolvedAt = new Date().toISOString();
}

export function getDelegationsByAgent(agentName: string): DelegationRecord[] {
  return DELEGATIONS.filter(
    (d) => d.fromAgent === agentName || d.toAgent === agentName
  );
}

export function getDelegationStats(): {
  total: number;
  pendingCount: number;
  successRate: number;
} {
  const total = DELEGATIONS.length;
  const pendingCount = DELEGATIONS.filter((d) => d.status === "pending").length;
  const completed = DELEGATIONS.filter((d) => d.status === "completed").length;
  const resolved = DELEGATIONS.filter(
    (d) => d.status === "completed" || d.status === "rejected"
  ).length;
  const successRate = resolved > 0 ? (completed / resolved) * 100 : 0;
  return { total, pendingCount, successRate };
}
