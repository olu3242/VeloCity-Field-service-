export type WorkerStatus = "idle" | "processing" | "overloaded" | "offline";
export type WorkerRegion = "us-east" | "us-west" | "eu-west" | "ap-southeast" | "local";

export interface WorkerNode {
  workerId: string;
  region: WorkerRegion;
  status: WorkerStatus;
  currentLoad: number;
  processedCount: number;
  failedCount: number;
  lastHeartbeatAt: string;
  capabilities: string[];
}

export interface WorkloadAssignment {
  assignmentId: string;
  workerId: string;
  eventType: string;
  payload: Record<string, unknown>;
  priority: number;
  assignedAt: string;
}

const WORKER_REGISTRY = new Map<string, WorkerNode>();
const ASSIGNMENTS: WorkloadAssignment[] = [];

export function registerWorker(
  worker: Omit<WorkerNode, "processedCount" | "failedCount" | "lastHeartbeatAt">
): WorkerNode {
  const node: WorkerNode = {
    ...worker,
    processedCount: 0,
    failedCount: 0,
    lastHeartbeatAt: new Date().toISOString(),
  };
  WORKER_REGISTRY.set(node.workerId, node);
  return node;
}

export function heartbeat(workerId: string, load: number): void {
  const worker = WORKER_REGISTRY.get(workerId);
  if (!worker) return;
  worker.lastHeartbeatAt = new Date().toISOString();
  worker.currentLoad = load;
}

export function assignWorkload(
  eventType: string,
  payload: Record<string, unknown>,
  priority: number
): WorkloadAssignment | null {
  const candidates = Array.from(WORKER_REGISTRY.values()).filter(
    (w) =>
      w.status !== "offline" &&
      w.currentLoad < 80 &&
      (w.capabilities.length === 0 || w.capabilities.includes(eventType))
  );

  if (candidates.length === 0) return null;

  const worker = candidates.reduce((best, cur) =>
    cur.currentLoad < best.currentLoad ? cur : best
  );

  const assignment: WorkloadAssignment = {
    assignmentId: `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workerId: worker.workerId,
    eventType,
    payload,
    priority,
    assignedAt: new Date().toISOString(),
  };

  ASSIGNMENTS.push(assignment);
  return assignment;
}

export function getWorkerHealth(): {
  total: number;
  idle: number;
  processing: number;
  overloaded: number;
  offline: number;
} {
  const workers = Array.from(WORKER_REGISTRY.values());
  return {
    total: workers.length,
    idle: workers.filter((w) => w.status === "idle").length,
    processing: workers.filter((w) => w.status === "processing").length,
    overloaded: workers.filter((w) => w.status === "overloaded").length,
    offline: workers.filter((w) => w.status === "offline").length,
  };
}

export function deregisterStaleWorkers(maxSilenceMs = 300_000): number {
  const cutoff = Date.now() - maxSilenceMs;
  let removed = 0;
  for (const [id, worker] of Array.from(WORKER_REGISTRY.entries())) {
    if (new Date(worker.lastHeartbeatAt).getTime() < cutoff) {
      WORKER_REGISTRY.delete(id);
      removed++;
    }
  }
  return removed;
}

// Register default local worker on module load
registerWorker({
  workerId: "local-worker-1",
  region: "local",
  status: "idle",
  currentLoad: 0,
  capabilities: [],
});
