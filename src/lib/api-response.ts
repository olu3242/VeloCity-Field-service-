/**
 * VeloCity Global API Response Model
 *
 * All API routes should return responses built with these helpers to ensure
 * a consistent shape across the platform. Every response carries a
 * correlationId for distributed tracing and support lookups.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  correlationId: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
  correlationId: string;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

// ── Error codes ───────────────────────────────────────────────────────────

export const API_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "TENANT_RESOLUTION_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

// HTTP status codes that map to each error code
const ERROR_STATUS_MAP: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  TENANT_RESOLUTION_FAILED: 500,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

// ── ApiError class ────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code];
    this.details = details;
  }
}

// ── Factories ─────────────────────────────────────────────────────────────

/**
 * Build a successful API response envelope.
 *
 * @param data    - The response payload.
 * @param meta    - Optional pagination/metadata (page, total, etc.).
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: Record<string, unknown>
): SuccessResponse<T> {
  return {
    success: true,
    data,
    ...(meta !== undefined ? { meta } : {}),
    correlationId: crypto.randomUUID(),
  };
}

/**
 * Build an error API response envelope.
 *
 * @param code     - One of the platform error codes.
 * @param message  - Human-readable error description (safe to surface).
 * @param details  - Optional structured context (validation issues, etc.).
 */
export function createErrorResponse(
  code: ApiErrorCode,
  message: string,
  details?: unknown
): ErrorResponse {
  return {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    correlationId: crypto.randomUUID(),
  };
}

// ── Error handler ─────────────────────────────────────────────────────────

/**
 * Map a caught error to an `ErrorResponse`.
 *
 * Handles `ApiError` instances directly. Falls back to `fallbackCode`
 * (default `INTERNAL_ERROR`) for unknown errors so callers never leak
 * raw stack traces.
 *
 * Usage in an API route:
 * ```ts
 * try {
 *   // ...
 * } catch (err) {
 *   const response = handleApiError(err);
 *   return NextResponse.json(response, { status: getStatusCode(response) });
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  fallbackCode: ApiErrorCode = "INTERNAL_ERROR"
): ErrorResponse {
  if (error instanceof ApiError) {
    return createErrorResponse(error.code, error.message, error.details);
  }

  // Tenant resolution failures come in as plain Errors with a .code property
  if (
    error instanceof Error &&
    (error as Error & { code?: string }).code === "TENANT_RESOLUTION_FAILED"
  ) {
    return createErrorResponse(
      "TENANT_RESOLUTION_FAILED",
      "Unable to determine tenant for this request."
    );
  }

  // Log unexpected errors server-side; never surface raw messages to clients
  if (process.env.NODE_ENV !== "production") {
    console.error("[VeloCity API Error]", error);
  } else {
    console.error("[VeloCity API Error]", error instanceof Error ? error.message : String(error));
  }

  const message =
    fallbackCode === "INTERNAL_ERROR"
      ? "An unexpected error occurred. Please try again."
      : `Request failed: ${fallbackCode}`;

  return createErrorResponse(fallbackCode, message);
}

/**
 * Retrieve the HTTP status code for a response envelope.
 * Pass to `NextResponse.json(response, { status: getStatusCode(response) })`.
 */
export function getStatusCode(response: ApiResponse): number {
  if (response.success) return 200;
  return ERROR_STATUS_MAP[response.error.code] ?? 500;
}
