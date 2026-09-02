// Continuous Learning — records execution metrics and aggregates learning signals.
// After every completed execution, metrics are persisted and fed back into the
// AI Planner (via contextual hints), Digital Twin, and Knowledge Graph.

import { getAdminClient } from "@/lib/supabase/admin";
import type { ExecutionContext, ExecutionMetrics, LearningSignal } from "./types";
import { scorePlanAccuracy } from "./planner";

// ── Metric computation ────────────────────────────────────────────────────────

export function computeExecutionMetrics(ctx: ExecutionContext): ExecutionMetrics {
  const graph = ctx.graph;
  const nodeCount = graph?.nodes.length ?? 0;
  const completedNodes = graph?.nodes.filter((n) => n.status === "completed").length ?? 0;
  const parallelNodes = Math.max(
    1,
    graph?.nodes.filter((n) => n.dependencies.length === 0).length ?? 1,
  );
  const totalRetries = graph?.nodes.reduce((acc, n) => acc + n.retryCount, 0) ?? 0;

  const aiPlanAccuracy =
    ctx.plan && ctx.completedAt
      ? scorePlanAccuracy(
          ctx.plan,
          ctx.telemetry.totalDurationMs,
          nodeCount,
        )
      : undefined;

  const slaMs = 30_000; // default SLA for any execution; individual workstreams may override
  const slaCompliant = ctx.telemetry.totalDurationMs <= slaMs;

  return {
    executionId: ctx.executionId,
    workstream: ctx.workstream,
    workflow: ctx.workflow,
    tenantId: ctx.tenantId,
    status: ctx.status,
    durationMs: ctx.telemetry.totalDurationMs,
    nodeCount,
    parallelNodes,
    retryCount: totalRetries,
    successRate: nodeCount > 0 ? completedNodes / nodeCount : 1,
    recoveryRate: totalRetries > 0 ? completedNodes / nodeCount : 1,
    slaCompliant,
    aiPlanAccuracy,
    computedAt: new Date().toISOString(),
  };
}

// ── Metric persistence ────────────────────────────────────────────────────────

export async function recordExecutionMetrics(ctx: ExecutionContext): Promise<void> {
  try {
    const metrics = computeExecutionMetrics(ctx);
    const supabase = getAdminClient();

    await supabase.from("system_events").insert({
      tenant_id: ctx.tenantId,
      event_type: "execution.metrics",
      payload: metrics as unknown as Record<string, unknown>,
    });
  } catch {
    console.warn(`[WEF] Failed to record metrics: ${ctx.executionId}`);
  }
}

// ── Metric aggregation (for Command Center + Planner feedback) ────────────────

export interface AggregatedMetrics {
  workstream: string;
  workflow: string;
  executionCount: number;
  averageDurationMs: number;
  p95DurationMs: number;
  successRate: number;
  averageRetries: number;
  slaComplianceRate: number;
  aiPlanAccuracy?: number;
  topBottleneck?: string;
  computedAt: string;
}

export async function aggregateWorkstreamMetrics(
  tenantId: string,
  workstream: string,
  windowHours = 24,
): Promise<AggregatedMetrics | null> {
  try {
    const supabase = getAdminClient();
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("system_events")
      .select("payload")
      .eq("tenant_id", tenantId)
      .eq("event_type", "execution.metrics")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!data || data.length === 0) return null;

    const rows = data
      .map((r) => r.payload as unknown as ExecutionMetrics)
      .filter((r) => r.workstream === workstream);

    if (rows.length === 0) return null;

    const durations = rows.map((r) => r.durationMs).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);

    const accuracies = rows.filter((r) => r.aiPlanAccuracy !== undefined).map((r) => r.aiPlanAccuracy!);

    const workflowCounts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.workflow] = (acc[r.workflow] ?? 0) + 1;
      return acc;
    }, {});
    const topWorkflow = Object.entries(workflowCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      workstream,
      workflow: topWorkflow ?? "mixed",
      executionCount: rows.length,
      averageDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      p95DurationMs: durations[p95Index] ?? durations[durations.length - 1] ?? 0,
      successRate: rows.filter((r) => r.status === "completed").length / rows.length,
      averageRetries: rows.reduce((acc, r) => acc + r.retryCount, 0) / rows.length,
      slaComplianceRate: rows.filter((r) => r.slaCompliant).length / rows.length,
      aiPlanAccuracy: accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : undefined,
      topBottleneck: topWorkflow,
      computedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Learning signals (fed to AI Planner as context hints) ────────────────────

export async function computeLearningSignals(
  tenantId: string,
  workstreams: string[],
): Promise<LearningSignal[]> {
  const signals: LearningSignal[] = [];

  for (const ws of workstreams) {
    const agg = await aggregateWorkstreamMetrics(tenantId, ws);
    if (!agg) continue;

    let recommendation = "No changes recommended";
    if (agg.successRate < 0.9) {
      recommendation = `Success rate ${(agg.successRate * 100).toFixed(0)}% — investigate failure patterns`;
    } else if (agg.slaComplianceRate < 0.8) {
      recommendation = `SLA compliance ${(agg.slaComplianceRate * 100).toFixed(0)}% — optimize critical path`;
    } else if (agg.averageRetries > 1) {
      recommendation = `Average ${agg.averageRetries.toFixed(1)} retries — improve dependency reliability`;
    }

    signals.push({
      workstream: ws,
      workflow: agg.workflow,
      averageDurationMs: agg.averageDurationMs,
      successRate: agg.successRate,
      topBottleneck: agg.topBottleneck,
      recommendation,
      computedAt: agg.computedAt,
    });
  }

  return signals;
}

// ── Learning signal formatting (for AI Planner prompt enrichment) ─────────────

export function formatSignalsAsHints(signals: LearningSignal[]): string[] {
  return signals.map(
    (s) =>
      `[${s.workstream}] avg ${Math.round(s.averageDurationMs)}ms, ${(s.successRate * 100).toFixed(0)}% success — ${s.recommendation}`,
  );
}
