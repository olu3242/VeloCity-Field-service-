/**
 * Execution Context — per-execution envelope for distributed-safe orchestration.
 */

export interface ExecutionContext {
  executionId: string
  tenantId?: string
  workflowId?: string
  correlationId: string
  traceId: string
  causationId?: string
  priority: "low" | "normal" | "high" | "critical"
  initiatedBy: string
  initiatedAt: string
  deadline?: string
  attempt: number
  maxAttempts: number
  tags: Record<string, string>
  metadata: Record<string, unknown>
}

interface CreateOptions {
  tenantId?: string
  workflowId?: string
  correlationId?: string
  traceId?: string
  causationId?: string
  priority?: ExecutionContext["priority"]
  deadline?: string
  maxAttempts?: number
  tags?: Record<string, string>
  metadata?: Record<string, unknown>
}

export function createExecutionContext(
  initiatedBy: string,
  options?: CreateOptions
): ExecutionContext {
  return {
    executionId: crypto.randomUUID(),
    tenantId: options?.tenantId,
    workflowId: options?.workflowId,
    correlationId: options?.correlationId ?? crypto.randomUUID(),
    traceId: options?.traceId ?? crypto.randomUUID(),
    causationId: options?.causationId,
    priority: options?.priority ?? "normal",
    initiatedBy,
    initiatedAt: new Date().toISOString(),
    deadline: options?.deadline,
    attempt: 1,
    maxAttempts: options?.maxAttempts ?? 3,
    tags: options?.tags ?? {},
    metadata: options?.metadata ?? {},
  }
}

export function withTenant(
  ctx: ExecutionContext,
  tenantId: string
): ExecutionContext {
  return { ...ctx, tenantId }
}

export function isExpired(ctx: ExecutionContext): boolean {
  if (!ctx.deadline) return false
  return new Date(ctx.deadline) < new Date()
}

export function incrementAttempt(ctx: ExecutionContext): ExecutionContext {
  return { ...ctx, attempt: ctx.attempt + 1 }
}
