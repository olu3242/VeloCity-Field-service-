import { logger } from "@/runtime-core/observability"

export interface CorrelationEntry {
  correlationId: string
  tenantId?: string
  linkedExecutionIds: string[]
  linkedTraceIds: string[]
  linkedWorkflowIds: string[]
  linkedRemediationIds: string[]
  createdAt: string
  lastUpdatedAt: string
}

const CORRELATION_INDEX: Map<string, CorrelationEntry> = new Map()
const MAX_ENTRIES = 5000

export function ensureCorrelation(correlationId: string, tenantId?: string): CorrelationEntry {
  const existing = CORRELATION_INDEX.get(correlationId)
  if (existing) return existing

  if (CORRELATION_INDEX.size >= MAX_ENTRIES) {
    const oldest = Array.from(CORRELATION_INDEX.keys())[0]
    if (oldest !== undefined) CORRELATION_INDEX.delete(oldest)
  }

  const entry: CorrelationEntry = {
    correlationId,
    tenantId,
    linkedExecutionIds: [],
    linkedTraceIds: [],
    linkedWorkflowIds: [],
    linkedRemediationIds: [],
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  }
  CORRELATION_INDEX.set(correlationId, entry)
  logger.info(`Correlation ensured: ${correlationId}`, "correlation-fabric")
  return entry
}

export function linkExecution(correlationId: string, executionId: string): void {
  const entry = ensureCorrelation(correlationId)
  if (!entry.linkedExecutionIds.includes(executionId)) {
    entry.linkedExecutionIds.push(executionId)
    entry.lastUpdatedAt = new Date().toISOString()
  }
}

export function linkTrace(correlationId: string, traceId: string): void {
  const entry = ensureCorrelation(correlationId)
  if (!entry.linkedTraceIds.includes(traceId)) {
    entry.linkedTraceIds.push(traceId)
    entry.lastUpdatedAt = new Date().toISOString()
  }
}

export function linkWorkflow(correlationId: string, workflowId: string): void {
  const entry = ensureCorrelation(correlationId)
  if (!entry.linkedWorkflowIds.includes(workflowId)) {
    entry.linkedWorkflowIds.push(workflowId)
    entry.lastUpdatedAt = new Date().toISOString()
  }
}

export function linkRemediation(correlationId: string, remediationId: string): void {
  const entry = ensureCorrelation(correlationId)
  if (!entry.linkedRemediationIds.includes(remediationId)) {
    entry.linkedRemediationIds.push(remediationId)
    entry.lastUpdatedAt = new Date().toISOString()
  }
}

export function getCorrelation(correlationId: string): CorrelationEntry | undefined {
  return CORRELATION_INDEX.get(correlationId)
}

export function getCorrelationSummary(): {
  total: number
  avgLinkedItems: number
  withMultipleExecutions: number
} {
  const values = Array.from(CORRELATION_INDEX.values())
  const total = values.length
  const avgLinkedItems =
    total > 0
      ? values.reduce(
          (sum, e) =>
            sum +
            e.linkedExecutionIds.length +
            e.linkedTraceIds.length +
            e.linkedWorkflowIds.length +
            e.linkedRemediationIds.length,
          0
        ) / total
      : 0
  const withMultipleExecutions = values.filter((e) => e.linkedExecutionIds.length > 1).length
  return { total, avgLinkedItems, withMultipleExecutions }
}
