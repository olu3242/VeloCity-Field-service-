/**
 * Per-tenant runtime analytics.
 */

export interface TenantRuntimeMetrics {
  tenantId: string;
  eventsProcessed: number;
  eventsFailed: number;
  aiCallsTotal: number;
  aiCallsSucceeded: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  periodLabel: string;
}

export interface TenantRuntimeSummary {
  tenantId: string;
  totalEvents: number;
  successRate: number;
  aiSuccessRate: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  efficiency: number;
}

const METRICS_CAP = 30;
const METRICS = new Map<string, TenantRuntimeMetrics[]>();

export function recordTenantMetrics(metrics: TenantRuntimeMetrics): void {
  const list = METRICS.get(metrics.tenantId) ?? [];
  list.push(metrics);
  if (list.length > METRICS_CAP) list.shift();
  METRICS.set(metrics.tenantId, list);
}

export function getTenantSummary(
  tenantId: string
): TenantRuntimeSummary | undefined {
  const list = METRICS.get(tenantId);
  if (!list || list.length === 0) return undefined;

  let totalEvents = 0;
  let totalFailed = 0;
  let aiCallsTotal = 0;
  let aiCallsSucceeded = 0;
  let totalCostUsd = 0;
  let latencySum = 0;

  for (const m of list) {
    totalEvents += m.eventsProcessed;
    totalFailed += m.eventsFailed;
    aiCallsTotal += m.aiCallsTotal;
    aiCallsSucceeded += m.aiCallsSucceeded;
    totalCostUsd += m.totalCostUsd;
    latencySum += m.avgLatencyMs;
  }

  const successRate = totalEvents > 0 ? (totalEvents - totalFailed) / totalEvents : 0;
  const aiSuccessRate = aiCallsTotal > 0 ? aiCallsSucceeded / aiCallsTotal : 0;
  const avgLatencyMs = list.length > 0 ? latencySum / list.length : 0;
  const efficiency = ((successRate + aiSuccessRate) / 2) * 100;

  return {
    tenantId,
    totalEvents,
    successRate,
    aiSuccessRate,
    totalCostUsd,
    avgLatencyMs,
    efficiency,
  };
}

export function getTopCostTenants(
  limit = 10
): { tenantId: string; totalCostUsd: number }[] {
  const results: { tenantId: string; totalCostUsd: number }[] = [];

  for (const [tenantId, list] of Array.from(METRICS.entries())) {
    const totalCostUsd = list.reduce((sum, m) => sum + m.totalCostUsd, 0);
    results.push({ tenantId, totalCostUsd });
  }

  results.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  return results.slice(0, limit);
}

export function getTenantComparison(
  tenantIds: string[]
): TenantRuntimeSummary[] {
  return tenantIds
    .map((id) => getTenantSummary(id))
    .filter((s): s is TenantRuntimeSummary => s !== undefined);
}
