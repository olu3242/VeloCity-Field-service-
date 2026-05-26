export interface WorkerHeartbeat {
  workerId: string;
  timestamp: string;
  queueDepth: number;
  activeJobs: number;
  cpuLoad: number; // 0-1
  memoryUsageMb: number;
  isHealthy: boolean;
}

const HEARTBEAT_HISTORY_CAP = 10;
const STALE_THRESHOLD_MS = 30_000;

const HEARTBEAT_HISTORY = new Map<string, WorkerHeartbeat[]>();

export function recordHeartbeat(hb: WorkerHeartbeat): void {
  const history = HEARTBEAT_HISTORY.get(hb.workerId) ?? [];
  history.push(hb);
  if (history.length > HEARTBEAT_HISTORY_CAP) {
    history.shift();
  }
  HEARTBEAT_HISTORY.set(hb.workerId, history);
}

export function getLatestHeartbeats(): WorkerHeartbeat[] {
  const result: WorkerHeartbeat[] = [];
  for (const history of Array.from(HEARTBEAT_HISTORY.values())) {
    if (history.length > 0) {
      result.push(history[history.length - 1]);
    }
  }
  return result;
}

export function getStaleWorkers(): string[] {
  const cutoff = Date.now() - STALE_THRESHOLD_MS;
  const stale: string[] = [];

  for (const [workerId, history] of Array.from(HEARTBEAT_HISTORY.entries())) {
    if (history.length === 0) {
      stale.push(workerId);
      continue;
    }
    const latest = history[history.length - 1];
    if (new Date(latest.timestamp).getTime() < cutoff) {
      stale.push(workerId);
    }
  }

  return stale;
}

export function isWorkerHealthy(workerId: string): boolean {
  const history = HEARTBEAT_HISTORY.get(workerId);
  if (!history || history.length === 0) return false;

  const latest = history[history.length - 1];
  const cutoff = Date.now() - STALE_THRESHOLD_MS;

  if (new Date(latest.timestamp).getTime() < cutoff) return false;
  return latest.isHealthy;
}

export function getWorkerHistory(workerId: string): WorkerHeartbeat[] {
  return HEARTBEAT_HISTORY.get(workerId) ?? [];
}
