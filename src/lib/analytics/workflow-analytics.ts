import { calculateEffectiveness } from "@/lib/economy/telemetry";

export interface WorkflowMetric {
  workflowId: string;
  eventType: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  success: boolean;
  humanInterventionRequired: boolean;
  agentsInvolved: string[];
  tenantId?: string;
  costUsd?: number;
}

export interface WorkflowAnalytics {
  workflowId: string;
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  humanInterventionRate: number;
  avgCostUsd: number;
}

const WORKFLOW_METRICS: WorkflowMetric[] = [];
const CAP = 2000;

export function recordWorkflowRun(metric: WorkflowMetric): void {
  WORKFLOW_METRICS.push(metric);
  if (WORKFLOW_METRICS.length > CAP) WORKFLOW_METRICS.shift();
}

export function getWorkflowAnalytics(workflowId: string): WorkflowAnalytics | undefined {
  const metrics = WORKFLOW_METRICS.filter((m) => m.workflowId === workflowId);
  if (metrics.length === 0) return undefined;

  const totalRuns = metrics.length;
  const successRate = metrics.filter((m) => m.success).length / totalRuns;
  const humanInterventionRate = metrics.filter((m) => m.humanInterventionRequired).length / totalRuns;

  const durations = metrics
    .map((m) => m.durationMs)
    .filter((d): d is number => d !== undefined)
    .sort((a, b) => a - b);

  const avgDurationMs = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const p95Index = Math.floor(0.95 * durations.length);
  const p95DurationMs = durations.length > 0 ? (durations[p95Index] ?? durations[durations.length - 1]) : 0;

  const costs = metrics.map((m) => m.costUsd ?? 0);
  const avgCostUsd = costs.reduce((a, b) => a + b, 0) / totalRuns;

  return { workflowId, totalRuns, successRate, avgDurationMs, p95DurationMs, humanInterventionRate, avgCostUsd };
}

export function getTopWorkflows(limit = 10): WorkflowAnalytics[] {
  const ids = Array.from(new Set(WORKFLOW_METRICS.map((m) => m.workflowId)));
  const analytics = ids
    .map((id) => getWorkflowAnalytics(id))
    .filter((a): a is WorkflowAnalytics => a !== undefined)
    .sort((a, b) => b.totalRuns - a.totalRuns);
  return analytics.slice(0, limit);
}

export function getEffectivenessScore(): number {
  const effectiveness = calculateEffectiveness();
  return effectiveness.composite;
}
