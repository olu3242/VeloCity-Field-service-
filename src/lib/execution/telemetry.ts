// Execution Telemetry — structured observability for every WEF execution.
// Captures spans, computes flame graph data, and persists execution traces
// to system_events for the Enterprise Command Center.

import { generateRequestId } from "@/lib/tracing/span";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  ExecutionContext,
  ExecutionSpan,
  ExecutionTelemetry,
  ExecutionNode,
  FlameNode,
} from "./types";

// ── Telemetry factory ─────────────────────────────────────────────────────────

export function createTelemetry(): ExecutionTelemetry {
  return {
    spans: [],
    totalDurationMs: 0,
    successRate: 1,
    retryCount: 0,
    dependencyLatencies: {},
  };
}

// ── Span recording ────────────────────────────────────────────────────────────

export function recordSpanStart(
  telemetry: ExecutionTelemetry,
  name: string,
  nodeId: string,
  attributes: Record<string, string | number | boolean> = {},
): string {
  const spanId = generateRequestId();
  const span: ExecutionSpan = {
    spanId,
    nodeId,
    name,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    status: "running",
    attributes,
  };
  telemetry.spans.push(span);
  return spanId;
}

export function recordSpanEnd(
  telemetry: ExecutionTelemetry,
  spanId: string,
  status: "completed" | "failed",
  extraAttributes: Record<string, string | number | boolean> = {},
): void {
  const span = telemetry.spans.find((s) => s.spanId === spanId);
  if (!span) return;
  const started = new Date(span.startedAt).getTime();
  span.durationMs = Date.now() - started;
  span.status = status;
  span.attributes = { ...span.attributes, ...extraAttributes };
}

export function recordNodeTelemetry(
  telemetry: ExecutionTelemetry,
  node: ExecutionNode,
): void {
  if (!node.startedAt) return;

  const existing = telemetry.spans.find((s) => s.nodeId === node.id);
  if (existing) {
    existing.status = node.status === "completed" ? "completed" : "failed";
    existing.durationMs = node.durationMs ?? 0;
    existing.attributes = {
      ...existing.attributes,
      retryCount: node.retryCount,
      ...(node.error ? { error: node.error } : {}),
    };
    return;
  }

  telemetry.spans.push({
    spanId: generateRequestId(),
    nodeId: node.id,
    name: node.name,
    startedAt: node.startedAt,
    durationMs: node.durationMs ?? 0,
    status: node.status === "completed" ? "completed" : node.status === "failed" ? "failed" : "running",
    attributes: {
      workstream: node.workstream,
      retryCount: node.retryCount,
      ...(node.error ? { error: node.error } : {}),
    },
  });
}

export function recordDependencyLatency(
  telemetry: ExecutionTelemetry,
  dependency: string,
  latencyMs: number,
): void {
  telemetry.dependencyLatencies[dependency] = latencyMs;
}

// ── Aggregate metrics ─────────────────────────────────────────────────────────

export function finalizetelemetry(
  telemetry: ExecutionTelemetry,
  startedAt: string,
): void {
  telemetry.totalDurationMs = Date.now() - new Date(startedAt).getTime();
  telemetry.completedAt = new Date().toISOString();

  const nonRootSpans = telemetry.spans;
  if (nonRootSpans.length > 0) {
    const succeeded = nonRootSpans.filter((s) => s.status === "completed").length;
    telemetry.successRate = succeeded / nonRootSpans.length;
    telemetry.retryCount = nonRootSpans.reduce(
      (acc, s) => acc + ((s.attributes.retryCount as number) ?? 0),
      0,
    );
  }
}

// ── Flame graph generation ────────────────────────────────────────────────────

export function generateFlameGraph(telemetry: ExecutionTelemetry): FlameNode[] {
  if (telemetry.spans.length === 0) return [];

  const originMs = new Date(telemetry.spans[0].startedAt).getTime();
  const roots: FlameNode[] = [];

  // Build a flat list first, then nest by parenthood (simple depth-by-time approach)
  const nodes: FlameNode[] = telemetry.spans.map((span) => ({
    id: span.spanId,
    name: span.name,
    start: new Date(span.startedAt).getTime() - originMs,
    end: new Date(span.startedAt).getTime() - originMs + span.durationMs,
    duration: span.durationMs,
    depth: 0,
    status: span.status,
    children: [],
  }));

  // Assign depth: a span is a child if it starts and ends within its parent
  for (let i = 0; i < nodes.length; i++) {
    let placed = false;
    for (let j = i - 1; j >= 0; j--) {
      if (nodes[j].start <= nodes[i].start && nodes[j].end >= nodes[i].end) {
        nodes[i].depth = nodes[j].depth + 1;
        nodes[j].children.push(nodes[i]);
        placed = true;
        break;
      }
    }
    if (!placed) roots.push(nodes[i]);
  }

  return roots;
}

// ── Trace persistence ─────────────────────────────────────────────────────────

export async function persistExecutionTrace(ctx: ExecutionContext): Promise<void> {
  try {
    const supabase = getAdminClient();
    await supabase.from("system_events").insert({
      tenant_id: ctx.tenantId,
      event_type: "execution.trace",
      payload: {
        executionId: ctx.executionId,
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        actor: ctx.actor.id,
        actorSource: ctx.actor.source,
        workstream: ctx.workstream,
        workflow: ctx.workflow,
        intent: ctx.intent,
        status: ctx.status,
        durationMs: ctx.telemetry.totalDurationMs,
        successRate: ctx.telemetry.successRate,
        retryCount: ctx.telemetry.retryCount,
        nodeCount: ctx.graph?.nodes.length ?? 0,
        criticalPath: ctx.graph?.criticalPath ?? [],
        spanCount: ctx.telemetry.spans.length,
        riskScore: ctx.plan?.riskScore ?? 0,
        aiPlanned: !!ctx.plan,
        simulated: ctx.simulationGate?.simulated ?? false,
        knowledgeNodes: ctx.knowledgeContext?.nodes ?? 0,
        startedAt: ctx.startedAt,
        completedAt: ctx.completedAt ?? new Date().toISOString(),
      },
    });
  } catch {
    console.warn(`[WEF] Failed to persist execution trace: ${ctx.executionId}`);
  }
}
