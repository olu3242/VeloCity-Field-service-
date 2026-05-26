export interface ApprovalRequest {
  id: string;
  workflowId: string;
  stepId: string;
  requestedBy: string;
  approverRole: "admin" | "operations" | "finance";
  title: string;
  description: string;
  data: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
}

const approvalStore = new Map<string, ApprovalRequest>();

export function createApprovalRequest(
  req: Omit<ApprovalRequest, "id" | "createdAt" | "status">
): ApprovalRequest {
  const id = `apr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const record: ApprovalRequest = {
    ...req,
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  approvalStore.set(id, record);
  return record;
}

export function resolveApproval(
  id: string,
  decision: "approved" | "rejected",
  adminId: string,
  resolution?: string
): ApprovalRequest | null {
  const record = approvalStore.get(id);
  if (!record || record.status !== "pending") return null;

  const updated: ApprovalRequest = {
    ...record,
    status: decision,
    resolvedAt: new Date().toISOString(),
    resolvedBy: adminId,
    ...(resolution !== undefined ? { resolution } : {}),
  };
  approvalStore.set(id, updated);
  return updated;
}

export function getPendingApprovals(
  role?: ApprovalRequest["approverRole"]
): ApprovalRequest[] {
  return Array.from(approvalStore.values()).filter(
    (r) => r.status === "pending" && (role === undefined || r.approverRole === role)
  );
}

export function getApproval(id: string): ApprovalRequest | null {
  return approvalStore.get(id) ?? null;
}

export function expireStaleApprovals(): number {
  const now = new Date().toISOString();
  let count = 0;
  for (const [id, record] of Array.from(approvalStore.entries())) {
    if (record.status === "pending" && record.expiresAt < now) {
      approvalStore.set(id, { ...record, status: "expired" });
      count++;
    }
  }
  return count;
}
