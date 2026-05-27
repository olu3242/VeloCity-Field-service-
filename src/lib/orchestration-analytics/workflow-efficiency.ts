/**
 * Workflow Efficiency Analytics — tracks duration, steps, retries, and success rates.
 */

export interface WorkflowEfficiencyRecord {
  id: string;
  workflowType: string;
  tenantId: string;
  durationMs: number;
  stepCount: number;
  retryCount: number;
  succeeded: boolean;
  recordedAt: string;
}

const RECORDS: WorkflowEfficiencyRecord[] = [];
const CAP = 1000;

export function recordWorkflowRun(
  workflowType: string,
  tenantId: string,
  durationMs: number,
  stepCount: number,
  retryCount: number,
  succeeded: boolean
): WorkflowEfficiencyRecord {
  if (RECORDS.length >= CAP) RECORDS.shift();
  const record: WorkflowEfficiencyRecord = {
    id: crypto.randomUUID(),
    workflowType,
    tenantId,
    durationMs,
    stepCount,
    retryCount,
    succeeded,
    recordedAt: new Date().toISOString(),
  };
  RECORDS.push(record);
  return record;
}

export function getEfficiencyStats(
  workflowType: string
): { avgDurationMs: number; avgRetries: number; successRate: number; sampleCount: number } {
  const subset = RECORDS.filter((r) => r.workflowType === workflowType);
  const sampleCount = subset.length;
  if (sampleCount === 0) {
    return { avgDurationMs: 0, avgRetries: 0, successRate: 0, sampleCount: 0 };
  }
  const avgDurationMs = subset.reduce((s, r) => s + r.durationMs, 0) / sampleCount;
  const avgRetries = subset.reduce((s, r) => s + r.retryCount, 0) / sampleCount;
  const successRate = subset.filter((r) => r.succeeded).length / sampleCount;
  return { avgDurationMs, avgRetries, successRate, sampleCount };
}

export function getBottlenecks(
  minAvgDurationMs = 30_000
): { workflowType: string; avgDurationMs: number; sampleCount: number }[] {
  const grouped = new Map<string, number[]>();
  for (const r of RECORDS) {
    const bucket = grouped.get(r.workflowType) ?? [];
    bucket.push(r.durationMs);
    grouped.set(r.workflowType, bucket);
  }
  return Array.from(grouped.entries())
    .map(([workflowType, durations]) => ({
      workflowType,
      avgDurationMs: durations.reduce((s, d) => s + d, 0) / durations.length,
      sampleCount: durations.length,
    }))
    .filter((entry) => entry.avgDurationMs >= minAvgDurationMs)
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs);
}
