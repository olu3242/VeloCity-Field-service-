import { logger } from "@/runtime-core/observability"

export interface DistributedSpan {
  spanId: string
  name: string
  parentSpanId?: string
  startedAt: string
  endedAt?: string
  durationMs?: number
  status: "active" | "ok" | "error"
  tags: Record<string, string>
}

export interface DistributedTrace {
  traceId: string
  rootOperation: string
  tenantId?: string
  correlationId: string
  spans: DistributedSpan[]
  status: "active" | "completed" | "failed"
  startedAt: string
  completedAt?: string
  propagatedTo: string[]
}

const TRACES: Map<string, DistributedTrace> = new Map()
const MAX_TRACES = 2000

export function startDistributedTrace(
  rootOperation: string,
  correlationId: string,
  tenantId?: string
): DistributedTrace {
  if (TRACES.size >= MAX_TRACES) {
    const oldest = Array.from(TRACES.keys())[0]
    if (oldest !== undefined) TRACES.delete(oldest)
  }
  const trace: DistributedTrace = {
    traceId: crypto.randomUUID(),
    rootOperation,
    tenantId,
    correlationId,
    spans: [],
    status: "active",
    startedAt: new Date().toISOString(),
    propagatedTo: [],
  }
  TRACES.set(trace.traceId, trace)
  logger.info(`Distributed trace started: ${rootOperation}`, "distributed-tracing")
  return trace
}

export function addDistributedSpan(
  traceId: string,
  name: string,
  parentSpanId?: string,
  tags?: Record<string, string>
): string {
  const trace = TRACES.get(traceId)
  if (!trace) return ""
  const span: DistributedSpan = {
    spanId: crypto.randomUUID(),
    name,
    parentSpanId,
    startedAt: new Date().toISOString(),
    status: "active",
    tags: tags ?? {},
  }
  trace.spans.push(span)
  return span.spanId
}

export function completeSpan(
  traceId: string,
  spanId: string,
  status: "ok" | "error",
  durationMs?: number
): void {
  const trace = TRACES.get(traceId)
  if (!trace) return
  const span = trace.spans.find((s) => s.spanId === spanId)
  if (!span) return
  span.status = status
  span.endedAt = new Date().toISOString()
  span.durationMs = durationMs
}

export function propagateTrace(traceId: string, targetNodeId: string): void {
  const trace = TRACES.get(traceId)
  if (!trace) return
  if (!trace.propagatedTo.includes(targetNodeId)) {
    trace.propagatedTo.push(targetNodeId)
  }
}

export function completeTrace(traceId: string, status: "completed" | "failed"): void {
  const trace = TRACES.get(traceId)
  if (!trace) return
  trace.status = status
  trace.completedAt = new Date().toISOString()
  logger.info(`Trace ${traceId} completed: ${status}`, "distributed-tracing")
}

export function getTrace(traceId: string): DistributedTrace | undefined {
  return TRACES.get(traceId)
}

export function getTraceSummary(): {
  total: number
  active: number
  completed: number
  failed: number
  avgSpanCount: number
} {
  const values = Array.from(TRACES.values())
  const avgSpanCount =
    values.length > 0
      ? values.reduce((sum, t) => sum + t.spans.length, 0) / values.length
      : 0
  return {
    total: values.length,
    active: values.filter((t) => t.status === "active").length,
    completed: values.filter((t) => t.status === "completed").length,
    failed: values.filter((t) => t.status === "failed").length,
    avgSpanCount,
  }
}
