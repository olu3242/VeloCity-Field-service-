/**
 * API Contract — canonical request/response contracts for operator-facing APIs.
 */

export type ApiVersion = "v1"
export type ApiAuthScheme = "bearer" | "api_key" | "signed_request"

export interface OperatorRequest<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  requestId: string
  apiVersion: ApiVersion
  operation: string
  tenantId?: string
  authScheme: ApiAuthScheme
  correlationId: string
  traceId: string
  payload: T
  requestedAt: string
  signature?: string
  idempotencyKey?: string
}

export interface OperatorResponse<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  requestId: string
  correlationId: string
  success: boolean
  data?: T
  error?: { code: string; message: string; details?: Record<string, unknown> }
  responseAt: string
  durationMs: number
  traceId: string
}

const IDEMPOTENCY_CACHE: Map<string, string> = new Map()
const IDEMPOTENCY_CAP = 2000

export function createRequest<T extends Record<string, unknown>>(
  operation: string,
  payload: T,
  options?: {
    tenantId?: string
    authScheme?: ApiAuthScheme
    idempotencyKey?: string
    signature?: string
  }
): OperatorRequest<T> {
  return {
    requestId: crypto.randomUUID(),
    apiVersion: "v1",
    operation,
    tenantId: options?.tenantId,
    authScheme: options?.authScheme ?? "bearer",
    correlationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    payload,
    requestedAt: new Date().toISOString(),
    signature: options?.signature,
    idempotencyKey: options?.idempotencyKey,
  }
}

export function createResponse<T extends Record<string, unknown>>(
  requestId: string,
  correlationId: string,
  traceId: string,
  success: boolean,
  data?: T,
  error?: { code: string; message: string; details?: Record<string, unknown> },
  startedAt?: number
): OperatorResponse<T> {
  return {
    requestId,
    correlationId,
    success,
    data,
    error,
    responseAt: new Date().toISOString(),
    durationMs: startedAt !== undefined ? Date.now() - startedAt : 0,
    traceId,
  }
}

export function isIdempotentDuplicate(key: string): boolean {
  return IDEMPOTENCY_CACHE.has(key)
}

export function markIdempotent(key: string, requestId: string): void {
  if (IDEMPOTENCY_CACHE.size >= IDEMPOTENCY_CAP) {
    const firstKey = IDEMPOTENCY_CACHE.keys().next().value
    if (firstKey !== undefined) IDEMPOTENCY_CACHE.delete(firstKey)
  }
  IDEMPOTENCY_CACHE.set(key, requestId)
}
