export interface Span {
  spanId: string
  name: string
  parentSpanId?: string
  startedAt: string
  endedAt?: string
  durationMs?: number
  status: "active" | "ok" | "error"
  tags: Record<string, string>
  error?: string
}

export interface TraceContext {
  traceId: string
  correlationId: string
  causationId?: string
  tenantId?: string
  workflowId?: string
  spans: Span[]
  startedAt: string
  endedAt?: string
  rootOperation: string
}

const TRACES: Map<string, TraceContext> = new Map()
const MAX_TRACES = 500

export function startTrace(rootOperation: string, options?: {
  tenantId?: string
  correlationId?: string
  causationId?: string
  workflowId?: string
}): TraceContext {
  if (TRACES.size >= MAX_TRACES) {
    const firstKey = TRACES.keys().next().value as string
    TRACES.delete(firstKey)
  }
  const trace: TraceContext = {
    traceId: crypto.randomUUID(),
    correlationId: options?.correlationId ?? crypto.randomUUID(),
    causationId: options?.causationId,
    tenantId: options?.tenantId,
    workflowId: options?.workflowId,
    spans: [],
    startedAt: new Date().toISOString(),
    rootOperation,
  }
  TRACES.set(trace.traceId, trace)
  return trace
}

export function addSpan(traceId: string, name: string, parentSpanId?: string, tags?: Record<string, string>): Span {
  const span: Span = {
    spanId: crypto.randomUUID(),
    name,
    parentSpanId,
    startedAt: new Date().toISOString(),
    status: "active",
    tags: tags ?? {},
  }
  const trace = TRACES.get(traceId)
  if (trace) trace.spans.push(span)
  return span
}

export function finishSpan(traceId: string, spanId: string, status: "ok" | "error", error?: string): void {
  const trace = TRACES.get(traceId)
  if (!trace) return
  const span = trace.spans.find((s) => s.spanId === spanId)
  if (!span) return
  span.endedAt = new Date().toISOString()
  span.durationMs = new Date(span.endedAt).getTime() - new Date(span.startedAt).getTime()
  span.status = status
  if (error) span.error = error
}

export function finishTrace(traceId: string): TraceContext | undefined {
  const trace = TRACES.get(traceId)
  if (trace) trace.endedAt = new Date().toISOString()
  return trace
}

export function getTrace(traceId: string): TraceContext | undefined {
  return TRACES.get(traceId)
}
