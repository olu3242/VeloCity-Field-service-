// Server-side workstream executor: the authoritative lifecycle runner for
// all API routes, workers, and cron jobs. Every operation that passes through
// the executor gets correlation ID injection, stage tracking, span emission,
// SLA monitoring, and structured error wrapping — automatically.

import { generateRequestId, startSpan } from "@/lib/tracing/span";
import { toWorkstreamError } from "./errors";
import { withRetry } from "./recovery";
import { WORKSTREAM_REGISTRY } from "./registry";
import type {
  WorkstreamContext,
  WorkstreamResult,
  WorkstreamRuntimeState,
  WorkstreamStage,
} from "./types";

function buildInitialState(
  workstream: string,
  ctx: WorkstreamContext,
): WorkstreamRuntimeState {
  return {
    workstream,
    status: "initializing",
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    tenantId: ctx.tenantId,
    franchiseId: ctx.franchiseId ?? null,
    organizationId: ctx.organizationId ?? null,
    workflowId: null,
    latency: 0,
    retryCount: 0,
    dependencies: [],
    warnings: [],
    errors: [],
    lastSuccess: null,
    health: "healthy",
    degraded: false,
    recoverable: true,
  };
}

export function createWorkstreamContext(
  workstream: string,
  tenantId: string,
  actorId: string,
  actorRole: string,
  opts: { franchiseId?: string; organizationId?: string } = {},
): WorkstreamContext {
  return {
    workstream,
    correlationId: generateRequestId(),
    requestId: generateRequestId(),
    tenantId,
    actorId,
    actorRole,
    ...opts,
  };
}

// Core executor — wraps any async business logic function with the full
// workstream runtime contract: span, SLA check, error normalization.
export async function executeWorkstream<T>(
  workstreamId: string,
  ctx: WorkstreamContext,
  fn: (ctx: WorkstreamContext) => Promise<T>,
  opts: {
    retryable?: boolean;
    maxRetries?: number;
    stage?: WorkstreamStage;
  } = {},
): Promise<WorkstreamResult<T>> {
  const definition = WORKSTREAM_REGISTRY.find((w) => w.id === workstreamId);
  const startTime = Date.now();
  const state = buildInitialState(workstreamId, ctx);

  const span = startSpan(`workstream.${workstreamId}`, {
    attributes: {
      "workstream.id": workstreamId,
      "workstream.tenant_id": ctx.tenantId,
      "workstream.actor_role": ctx.actorRole,
      "workstream.correlation_id": ctx.correlationId,
    },
  });

  try {
    state.status = "ready";
    const run = () => fn(ctx);
    const data = opts.retryable
      ? await withRetry(run, { maxAttempts: opts.maxRetries ?? 3 }, opts.stage ?? "execute")
      : await run();

    const durationMs = Date.now() - startTime;
    state.latency = durationMs;
    state.lastSuccess = new Date().toISOString();
    span.setAttribute("workstream.duration_ms", durationMs);

    if (definition && durationMs > definition.slaMs) {
      state.warnings.push(
        `SLA violation: ${durationMs}ms > ${definition.slaMs}ms target`,
      );
      span.setAttribute("sla.violated", true);
      span.setAttribute("sla.target_ms", definition.slaMs);
    }

    span.end();
    return { ok: true, data, state, durationMs };
  } catch (err) {
    const wsErr = toWorkstreamError(err, ctx.correlationId);
    const durationMs = Date.now() - startTime;

    state.status = "failed";
    state.health = "degraded";
    state.degraded = true;
    state.recoverable = wsErr.retryable;
    state.latency = durationMs;
    state.errors.push({
      code: wsErr.code,
      message: wsErr.message,
      httpStatus: wsErr.httpStatus,
      dependency: wsErr.dependency,
      retryable: wsErr.retryable,
      correlationId: wsErr.correlationId,
      timestamp: wsErr.timestamp,
      stage: wsErr.stage,
    });

    span.setStatus("error");
    span.setAttribute("error.code", wsErr.code);
    span.setAttribute("error.stage", wsErr.stage);
    if (wsErr.dependency) span.setAttribute("error.dependency", wsErr.dependency);
    span.end();

    return { ok: false, error: state.errors[0], state, durationMs };
  }
}
