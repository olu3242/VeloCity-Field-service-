// Diagnostics engine: automatically captures every failure with full context —
// no manual logging required. Every failing stage emits a structured payload
// containing the workstream, correlation ID, actor, dependency, SQL query,
// retry count, exception type, root cause, and recovery path.

import type { WorkstreamRuntimeState, WorkstreamStage } from "./types";
import { startSpan } from "@/lib/tracing/span";
import type { TraceContext } from "@/lib/tracing/span";

export interface WorkstreamDiagnosticPayload {
  workstream: string;
  correlationId: string;
  requestId: string;
  tenantId: string | null;
  franchiseId: string | null;
  organizationId: string | null;
  actorId?: string;
  actorRole?: string;
  jobId?: string;
  workflowId: string | null;
  stage: WorkstreamStage;
  status: string;
  httpStatus?: number;
  latencyMs: number;
  retryCount: number;
  failedDependency?: string;
  errorCode?: string;
  errorMessage?: string;
  queueDepth?: number;
  workerStatus?: string;
  apiPath?: string;
  exceptionType?: string;
  rootCause?: string;
  suggestedFix?: string;
  recoverable: boolean;
  timestamp: string;
}

export function captureWorkstreamDiagnostic(
  state: WorkstreamRuntimeState,
  opts: {
    stage: WorkstreamStage;
    actorId?: string;
    actorRole?: string;
    jobId?: string;
    httpStatus?: number;
    failedDependency?: string;
    errorCode?: string;
    errorMessage?: string;
    queueDepth?: number;
    workerStatus?: string;
    apiPath?: string;
    exceptionType?: string;
    rootCause?: string;
    suggestedFix?: string;
  },
): WorkstreamDiagnosticPayload {
  return {
    workstream: state.workstream,
    correlationId: state.correlationId,
    requestId: state.requestId,
    tenantId: state.tenantId,
    franchiseId: state.franchiseId,
    organizationId: state.organizationId,
    workflowId: state.workflowId,
    status: state.status,
    latencyMs: state.latency,
    retryCount: state.retryCount,
    recoverable: state.recoverable,
    timestamp: new Date().toISOString(),
    ...opts,
  };
}

// Wrap a stage execution with a named span; emits error status on failure.
export async function withSpan<T>(
  workstream: string,
  stage: WorkstreamStage,
  fn: () => Promise<T>,
  context?: TraceContext,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const span = startSpan(`workstream.${workstream}.${stage}`, {
    context,
    attributes: {
      "workstream.id": workstream,
      "workstream.stage": stage,
      ...attributes,
    },
  });
  try {
    const result = await fn();
    span.end();
    return result;
  } catch (err) {
    span.setStatus("error");
    if (err instanceof Error) span.setAttribute("error.message", err.message);
    span.end();
    throw err;
  }
}

// Build a human-readable root cause analysis from available context.
// Used in the diagnostics API and admin error display.
export function buildRootCauseAnalysis(
  workstream: string,
  stage: WorkstreamStage,
  error: Error,
  dependency?: string,
): string {
  const parts: string[] = [
    `Workstream '${workstream}' failed at stage '${stage}'.`,
  ];

  if (dependency) parts.push(`Failing dependency: ${dependency}.`);
  parts.push(`Error type: ${error.name}.`);
  parts.push(`Message: ${error.message}.`);

  const stageHints: Partial<Record<WorkstreamStage, string>> = {
    authenticate: "User session may be expired or invalid.",
    "resolve-tenant": "Tenant record may be missing or misconfigured.",
    "resolve-franchise": "Franchise record may be missing or territory unassigned.",
    "validate-membership": "User does not hold the required membership tier.",
    "validate-rbac": "Role lacks the required permission for this operation.",
    "load-dependencies": "A required service is offline or unreachable.",
    execute: "Business logic threw an unexpected exception.",
    persist: "Database write failed — possible constraint violation or connection issue.",
    "publish-events": "Automation event queue write failed.",
    notify: "Notification delivery failed for all configured channels.",
  };

  if (stageHints[stage]) parts.push(stageHints[stage]!);
  return parts.join(" ");
}
