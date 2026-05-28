/**
 * Lifecycle event tracking for runtime executions.
 */

import { logger } from "@/runtime-core/observability"

export type LifecycleEvent =
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "execution_retried"
  | "execution_cancelled"
  | "execution_timeout"
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "checkpoint_saved"
  | "checkpoint_restored"

export interface LifecycleRecord {
  recordId: string
  executionId: string
  event: LifecycleEvent
  tenantId?: string
  workflowId?: string
  occurredAt: string
  durationMs?: number
  metadata: Record<string, unknown>
}

const LIFECYCLE_LOG: LifecycleRecord[] = []
const LOG_CAP = 3000

interface RecordOptions {
  tenantId?: string
  workflowId?: string
  durationMs?: number
  metadata?: Record<string, unknown>
}

export function recordLifecycleEvent(
  executionId: string,
  event: LifecycleEvent,
  options?: RecordOptions
): LifecycleRecord {
  if (LIFECYCLE_LOG.length >= LOG_CAP) LIFECYCLE_LOG.shift()
  const record: LifecycleRecord = {
    recordId: crypto.randomUUID(),
    executionId,
    event,
    tenantId: options?.tenantId,
    workflowId: options?.workflowId,
    occurredAt: new Date().toISOString(),
    durationMs: options?.durationMs,
    metadata: options?.metadata ?? {},
  }
  LIFECYCLE_LOG.push(record)
  logger.debug(`Lifecycle: ${event}`, "runtime-lifecycle", {
    traceId: undefined,
    metadata: { executionId, event },
  })
  return record
}

export function getExecutionHistory(executionId: string): LifecycleRecord[] {
  return LIFECYCLE_LOG.filter((r) => r.executionId === executionId)
}

export function getLifecycleSummary(): {
  total: number
  byEvent: Record<string, number>
  recentFailures: number
} {
  const byEvent: Record<string, number> = {}
  for (const r of LIFECYCLE_LOG) {
    byEvent[r.event] = (byEvent[r.event] ?? 0) + 1
  }
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const recentFailures = LIFECYCLE_LOG.filter(
    (r) =>
      (r.event === "execution_failed" || r.event === "workflow_failed") &&
      r.occurredAt >= fiveMinutesAgo
  ).length
  return { total: LIFECYCLE_LOG.length, byEvent, recentFailures }
}
