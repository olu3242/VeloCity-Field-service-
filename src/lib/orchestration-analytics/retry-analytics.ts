/**
 * Retry Analytics — tracks retry events and surfacing storming workflows.
 */

export interface RetryRecord {
  id: string;
  workflowType: string;
  tenantId: string;
  attemptNumber: number;
  reason: string;
  succeeded: boolean;
  delayMs: number;
  recordedAt: string;
}

const RETRIES: RetryRecord[] = [];
const CAP = 500;

export function recordRetry(
  workflowType: string,
  tenantId: string,
  attemptNumber: number,
  reason: string,
  succeeded: boolean,
  delayMs: number
): RetryRecord {
  if (RETRIES.length >= CAP) RETRIES.shift();
  const record: RetryRecord = {
    id: crypto.randomUUID(),
    workflowType,
    tenantId,
    attemptNumber,
    reason,
    succeeded,
    delayMs,
    recordedAt: new Date().toISOString(),
  };
  RETRIES.push(record);
  return record;
}

export function getRetryStats(
  workflowType?: string
): { totalRetries: number; successOnRetryRate: number; avgAttemptNumber: number; topReasons: string[] } {
  const subset = workflowType
    ? RETRIES.filter((r) => r.workflowType === workflowType)
    : RETRIES;
  const totalRetries = subset.length;
  if (totalRetries === 0) {
    return { totalRetries: 0, successOnRetryRate: 0, avgAttemptNumber: 0, topReasons: [] };
  }
  const successOnRetryRate = subset.filter((r) => r.succeeded).length / totalRetries;
  const avgAttemptNumber = subset.reduce((s, r) => s + r.attemptNumber, 0) / totalRetries;

  const reasonCounts = new Map<string, number>();
  for (const r of subset) {
    reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
  }
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason]) => reason);

  return { totalRetries, successOnRetryRate, avgAttemptNumber, topReasons };
}

export function getStormingWorkflows(threshold = 5): string[] {
  const counts = new Map<string, number>();
  for (const r of RETRIES) {
    counts.set(r.workflowType, (counts.get(r.workflowType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > threshold)
    .map(([workflowType]) => workflowType);
}
