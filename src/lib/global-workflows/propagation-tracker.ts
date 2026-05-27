export interface PropagationRecord {
  id: string;
  workflowId: string;
  tenantId: string;
  fromRegion: string;
  toRegion: string;
  status: "pending" | "propagated" | "failed";
  startedAt: string;
  completedAt?: string;
}

const PROPAGATIONS: PropagationRecord[] = [];
const CAP = 500;

export function recordPropagation(
  workflowId: string,
  tenantId: string,
  fromRegion: string,
  toRegion: string
): PropagationRecord {
  const record: PropagationRecord = {
    id: crypto.randomUUID(),
    workflowId,
    tenantId,
    fromRegion,
    toRegion,
    status: "pending",
    startedAt: new Date().toISOString(),
  };
  PROPAGATIONS.push(record);
  if (PROPAGATIONS.length > CAP) {
    PROPAGATIONS.splice(0, PROPAGATIONS.length - CAP);
  }
  return record;
}

export function completePropagation(
  id: string,
  status: "propagated" | "failed"
): void {
  const record = PROPAGATIONS.find((p) => p.id === id);
  if (record) {
    record.status = status;
    record.completedAt = new Date().toISOString();
  }
}

export function getActivePropagations(tenantId?: string): PropagationRecord[] {
  const pending = PROPAGATIONS.filter((p) => p.status === "pending");
  if (tenantId !== undefined) {
    return pending.filter((p) => p.tenantId === tenantId);
  }
  return pending;
}

export function getPropagationStats(): {
  total: number;
  successRate: number;
  avgDurationMs: number;
} {
  const total = PROPAGATIONS.length;
  const completed = PROPAGATIONS.filter((p) => p.completedAt !== undefined);
  const succeeded = completed.filter((p) => p.status === "propagated");
  const successRate = completed.length === 0 ? 0 : succeeded.length / completed.length;

  const avgDurationMs =
    completed.length === 0
      ? 0
      : completed.reduce((sum, p) => {
          const start = new Date(p.startedAt).getTime();
          const end = new Date(p.completedAt!).getTime();
          return sum + (end - start);
        }, 0) / completed.length;

  return { total, successRate, avgDurationMs };
}
