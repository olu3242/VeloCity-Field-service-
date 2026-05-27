export interface FailoverEvent {
  id: string;
  failedWorkerId: string;
  detectedAt: string;
  redistributedTo: string[];
  affectedQueueDepth: number;
  recoveryMs?: number;
  resolved: boolean;
  resolvedAt?: string;
}

const FAILOVER_EVENTS: FailoverEvent[] = [];
const CAP = 100;

export function recordWorkerFailover(
  failedWorkerId: string,
  redistributedTo: string[],
  affectedQueueDepth: number
): FailoverEvent {
  const event: FailoverEvent = {
    id: crypto.randomUUID(),
    failedWorkerId,
    detectedAt: new Date().toISOString(),
    redistributedTo,
    affectedQueueDepth,
    resolved: false,
  };

  FAILOVER_EVENTS.push(event);
  if (FAILOVER_EVENTS.length > CAP) FAILOVER_EVENTS.shift();

  return event;
}

export function resolveFailover(id: string): void {
  const event = FAILOVER_EVENTS.find((e) => e.id === id);
  if (!event) return;

  const resolvedAt = new Date().toISOString();
  event.resolved = true;
  event.resolvedAt = resolvedAt;
  event.recoveryMs = Date.now() - new Date(event.detectedAt).getTime();
}

export function getActiveFailovers(): FailoverEvent[] {
  return FAILOVER_EVENTS.filter((e) => !e.resolved);
}

export function getFailoverHistory(limit = 20): FailoverEvent[] {
  return FAILOVER_EVENTS.slice(-limit);
}

export function getAvgRecoveryMs(): number {
  const resolved = FAILOVER_EVENTS.filter(
    (e) => e.resolved && e.recoveryMs !== undefined
  );
  if (resolved.length === 0) return 0;
  return resolved.reduce((s, e) => s + (e.recoveryMs ?? 0), 0) / resolved.length;
}
