// Event Fabric — standardized WEF event publication.
// All WEF events are persisted to system_events with full correlation context.
// Non-critical path: failures are logged but never propagate to the caller.

import { getAdminClient } from "@/lib/supabase/admin";
import { generateRequestId } from "@/lib/tracing/span";
import type { WEFEvent, WEFEventType, ExecutionContext, ExecutionNode } from "./types";

// ── Core emitter ──────────────────────────────────────────────────────────────

export async function publishWEFEvent(event: WEFEvent): Promise<void> {
  try {
    const supabase = getAdminClient();
    await supabase.from("system_events").insert({
      tenant_id: event.tenantId,
      event_type: event.type,
      payload: {
        eventId: event.eventId,
        executionId: event.executionId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        traceId: event.traceId,
        actor: event.actor,
        workstream: event.workstream,
        workflow: event.workflow,
        timestamp: event.timestamp,
        ...event.payload,
      },
    });
  } catch {
    // Telemetry is non-critical — never propagate to caller
    console.warn(`[WEF] Failed to persist event: ${event.type} (${event.executionId})`);
  }
}

// ── Context-bound emitter ─────────────────────────────────────────────────────

function fromContext(
  type: WEFEventType,
  ctx: ExecutionContext,
  payload: Record<string, unknown> = {},
): WEFEvent {
  return {
    eventId: generateRequestId(),
    type,
    executionId: ctx.executionId,
    correlationId: ctx.correlationId,
    causationId: ctx.causationId,
    traceId: ctx.traceId,
    tenantId: ctx.tenantId,
    actor: ctx.actor.id,
    workstream: ctx.workstream,
    workflow: ctx.workflow,
    timestamp: new Date().toISOString(),
    payload,
  };
}

// ── Typed event publishers ────────────────────────────────────────────────────

export async function publishExecutionStarted(ctx: ExecutionContext): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.started", ctx, {
      intent: ctx.intent,
      source: ctx.actor.source,
      workstream: ctx.workstream,
      workflow: ctx.workflow,
    }),
  );
}

export async function publishExecutionPlanning(ctx: ExecutionContext): Promise<void> {
  await publishWEFEvent(fromContext("execution.planning", ctx, { intent: ctx.intent }));
}

export async function publishGraphGenerated(ctx: ExecutionContext): Promise<void> {
  const g = ctx.graph;
  await publishWEFEvent(
    fromContext("execution.graph.generated", ctx, {
      nodeCount: g?.nodes.length ?? 0,
      criticalPath: g?.criticalPath ?? [],
      estimatedDurationMs: ctx.plan?.estimatedDurationMs ?? 0,
      parallelNodes: ctx.plan?.parallelNodes ?? 0,
      riskScore: ctx.plan?.riskScore ?? 0,
    }),
  );
}

export async function publishNodeStarted(
  ctx: ExecutionContext,
  node: ExecutionNode,
): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.node.started", ctx, {
      nodeId: node.id,
      nodeName: node.name,
      nodeWorkstream: node.workstream,
      dependencies: node.dependencies,
    }),
  );
}

export async function publishNodeCompleted(
  ctx: ExecutionContext,
  node: ExecutionNode,
): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.node.completed", ctx, {
      nodeId: node.id,
      nodeName: node.name,
      durationMs: node.durationMs ?? 0,
      retryCount: node.retryCount,
    }),
  );
}

export async function publishNodeFailed(
  ctx: ExecutionContext,
  node: ExecutionNode,
): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.node.failed", ctx, {
      nodeId: node.id,
      nodeName: node.name,
      error: node.error,
      retryCount: node.retryCount,
      durationMs: node.durationMs ?? 0,
    }),
  );
}

export async function publishNodeSkipped(
  ctx: ExecutionContext,
  node: ExecutionNode,
): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.node.skipped", ctx, {
      nodeId: node.id,
      nodeName: node.name,
      reason: "dependency-failed",
    }),
  );
}

export async function publishExecutionRecovered(
  ctx: ExecutionContext,
  strategy: string,
  recoveredNodes: string[],
): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.recovered", ctx, { strategy, recoveredNodes }),
  );
}

export async function publishExecutionCompleted(
  ctx: ExecutionContext,
  durationMs: number,
): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.completed", ctx, {
      durationMs,
      status: ctx.status,
      retryCount: ctx.telemetry.retryCount,
      successRate: ctx.telemetry.successRate,
    }),
  );
}

export async function publishExecutionFailed(
  ctx: ExecutionContext,
  error: string,
  durationMs: number,
): Promise<void> {
  await publishWEFEvent(
    fromContext("execution.failed", ctx, { error, durationMs }),
  );
}

export async function publishExecutionDegraded(
  ctx: ExecutionContext,
  reason: string,
): Promise<void> {
  await publishWEFEvent(fromContext("execution.degraded", ctx, { reason }));
}

export async function publishAIPlanRequested(ctx: ExecutionContext): Promise<void> {
  await publishWEFEvent(
    fromContext("ai.plan.requested", ctx, { intent: ctx.intent }),
  );
}

export async function publishAIPlanCompleted(
  ctx: ExecutionContext,
  riskScore: number,
  estimatedDurationMs: number,
): Promise<void> {
  await publishWEFEvent(
    fromContext("ai.plan.completed", ctx, { riskScore, estimatedDurationMs }),
  );
}

export async function publishKnowledgeRetrieved(
  ctx: ExecutionContext,
  entityType: string,
  nodeCount: number,
): Promise<void> {
  await publishWEFEvent(
    fromContext("knowledge.retrieved", ctx, { entityType, nodeCount }),
  );
}

export async function publishSimulationRun(
  ctx: ExecutionContext,
  confidence: number,
  passed: boolean,
): Promise<void> {
  const type: WEFEventType = passed ? "simulation.passed" : "simulation.blocked";
  await publishWEFEvent(fromContext(type, ctx, { confidence, threshold: ctx.simulationGate?.threshold }));
}

export async function publishPolicyEvaluated(
  ctx: ExecutionContext,
  allowed: boolean,
  reason: string,
): Promise<void> {
  await publishWEFEvent(
    fromContext("policy.evaluated", ctx, { allowed, reason }),
  );
}

export async function publishLearningCycleCompleted(
  ctx: ExecutionContext,
  metricsCount: number,
): Promise<void> {
  await publishWEFEvent(
    fromContext("learning.cycle.completed", ctx, { metricsCount }),
  );
}
