// Enterprise Error Standard: every workstream failure produces a structured,
// actionable error — never a generic "Something went wrong" message.
// Every error includes: title, status label, error code, HTTP status,
// failing dependency, retry indicator, correlation ID, and suggested actions.

import type { WorkstreamStage } from "./types";

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface EnterpriseErrorPayload {
  title: string;
  statusLabel: string;
  code: string;
  httpStatus: number;
  dependency?: string;
  retryable: boolean;
  correlationId: string;
  suggestedActions: string[];
  stage: WorkstreamStage;
  timestamp: string;
}

export class WorkstreamError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly dependency?: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly stage: WorkstreamStage;
  readonly suggestedActions: string[];
  readonly timestamp: string;

  constructor(payload: {
    message: string;
    code: string;
    httpStatus?: number;
    dependency?: string;
    retryable?: boolean;
    correlationId?: string;
    stage?: WorkstreamStage;
    suggestedActions?: string[];
  }) {
    super(payload.message);
    this.name = "WorkstreamError";
    this.code = payload.code;
    this.httpStatus = payload.httpStatus ?? 500;
    this.dependency = payload.dependency;
    this.retryable = payload.retryable ?? false;
    this.correlationId = payload.correlationId ?? randomHex(8);
    this.stage = payload.stage ?? "execute";
    this.suggestedActions = payload.suggestedActions ?? ["Retry", "Contact Support"];
    this.timestamp = new Date().toISOString();
  }

  toPayload(): EnterpriseErrorPayload {
    return {
      title: this.message,
      statusLabel: this.dependency
        ? `${this.dependency} Unavailable`
        : `Stage Failed: ${this.stage}`,
      code: this.code,
      httpStatus: this.httpStatus,
      dependency: this.dependency,
      retryable: this.retryable,
      correlationId: this.correlationId,
      suggestedActions: this.suggestedActions,
      stage: this.stage,
      timestamp: this.timestamp,
    };
  }
}

export function toWorkstreamError(err: unknown, correlationId?: string): WorkstreamError {
  if (err instanceof WorkstreamError) return err;
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";
  return new WorkstreamError({
    message,
    code: "WS_UNKNOWN_ERROR",
    httpStatus: 500,
    retryable: true,
    correlationId,
    stage: "execute",
    suggestedActions: ["Retry", "Open Diagnostics", "Report Issue"],
  });
}

// Named error factories — each maps to the exact stage and dependency that failed.
export const WorkstreamErrors = {
  authRequired: (correlationId?: string) =>
    new WorkstreamError({
      message: "Authentication required to access this workstream",
      code: "WS_AUTH_REQUIRED",
      httpStatus: 401,
      stage: "authenticate",
      retryable: false,
      correlationId,
      suggestedActions: ["Log in", "Refresh session"],
    }),

  sessionExpired: (correlationId?: string) =>
    new WorkstreamError({
      message: "Your session has expired",
      code: "WS_SESSION_EXPIRED",
      httpStatus: 401,
      stage: "authenticate",
      retryable: false,
      correlationId,
      suggestedActions: ["Log in again"],
    }),

  tenantResolutionFailed: (correlationId?: string) =>
    new WorkstreamError({
      message: "Tenant context could not be resolved",
      code: "WS_TENANT_RESOLUTION_FAILED",
      httpStatus: 403,
      stage: "resolve-tenant",
      dependency: "Tenant Service",
      retryable: true,
      correlationId,
      suggestedActions: ["Retry", "Contact your administrator"],
    }),

  franchiseResolutionFailed: (correlationId?: string) =>
    new WorkstreamError({
      message: "Franchise context could not be resolved",
      code: "WS_FRANCHISE_RESOLUTION_FAILED",
      httpStatus: 403,
      stage: "resolve-franchise",
      dependency: "Franchise Engine",
      retryable: true,
      correlationId,
      suggestedActions: ["Retry", "Contact franchise support"],
    }),

  membershipRequired: (tier: string, correlationId?: string) =>
    new WorkstreamError({
      message: `${tier} membership required to access this workstream`,
      code: "WS_MEMBERSHIP_REQUIRED",
      httpStatus: 402,
      stage: "validate-membership",
      retryable: false,
      correlationId,
      suggestedActions: ["Upgrade membership", "Contact your administrator"],
    }),

  permissionDenied: (permission: string, correlationId?: string) =>
    new WorkstreamError({
      message: `Permission required: ${permission}`,
      code: "WS_PERMISSION_DENIED",
      httpStatus: 403,
      stage: "validate-rbac",
      retryable: false,
      correlationId,
      suggestedActions: ["Contact your administrator to grant access"],
    }),

  dependencyUnavailable: (dependency: string, httpStatus = 503, correlationId?: string) =>
    new WorkstreamError({
      message: `${dependency} temporarily unavailable`,
      code: "WS_DEPENDENCY_UNAVAILABLE",
      httpStatus,
      stage: "load-dependencies",
      dependency,
      retryable: true,
      correlationId,
      suggestedActions: ["Retry", "Open Diagnostics", "Report Issue"],
    }),

  dependencyTimeout: (dependency: string, correlationId?: string) =>
    new WorkstreamError({
      message: `${dependency} timed out`,
      code: "WS_DEPENDENCY_TIMEOUT",
      httpStatus: 504,
      stage: "execute",
      dependency,
      retryable: true,
      correlationId,
      suggestedActions: ["Retry", "Open Diagnostics"],
    }),

  executionFailed: (reason: string, correlationId?: string) =>
    new WorkstreamError({
      message: reason,
      code: "WS_EXECUTION_FAILED",
      httpStatus: 500,
      stage: "execute",
      retryable: true,
      correlationId,
      suggestedActions: ["Retry", "Open Diagnostics", "Report Issue"],
    }),

  persistenceFailed: (reason: string, correlationId?: string) =>
    new WorkstreamError({
      message: `Failed to persist transaction: ${reason}`,
      code: "WS_PERSISTENCE_FAILED",
      httpStatus: 500,
      stage: "persist",
      dependency: "Database",
      retryable: true,
      correlationId,
      suggestedActions: ["Retry", "Open Diagnostics"],
    }),

  eventPublishFailed: (eventType: string, correlationId?: string) =>
    new WorkstreamError({
      message: `Failed to publish event: ${eventType}`,
      code: "WS_EVENT_PUBLISH_FAILED",
      httpStatus: 500,
      stage: "publish-events",
      dependency: "Automation Engine",
      retryable: true,
      correlationId,
      suggestedActions: ["Retry", "Check automation queue"],
    }),
};
