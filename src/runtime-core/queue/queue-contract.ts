export interface QueueContext {
  correlationId: string
  traceId: string
  tenantId?: string
  causationEventId?: string
  retryCount: number
  priority: "low" | "normal" | "high" | "critical"
  enqueuedAt: string
  scheduledFor?: string    // optional delayed execution
}

export interface QueueItem<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  eventType: string
  payload: T
  context: QueueContext
  status: "pending" | "processing" | "completed" | "failed" | "dead_letter"
  attempts: number
  lastAttemptAt?: string
  completedAt?: string
  error?: string
}

// Canonical worker function signature — all workers must conform
export type WorkerFn = (item: QueueItem) => Promise<void>

export function createQueueItem<T extends Record<string, unknown>>(
  eventType: string,
  payload: T,
  context: Partial<QueueContext> & { tenantId?: string }
): QueueItem<T> {
  return {
    id: crypto.randomUUID(),
    eventType,
    payload,
    context: {
      correlationId: context.correlationId ?? crypto.randomUUID(),
      traceId: context.traceId ?? crypto.randomUUID(),
      tenantId: context.tenantId,
      causationEventId: context.causationEventId,
      retryCount: context.retryCount ?? 0,
      priority: context.priority ?? "normal",
      enqueuedAt: new Date().toISOString(),
      scheduledFor: context.scheduledFor,
    },
    status: "pending",
    attempts: 0,
  }
}

export function isRetryable(item: QueueItem, maxAttempts = 5): boolean {
  return item.attempts < maxAttempts && item.status !== "dead_letter"
}
