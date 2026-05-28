import { startTrace, addSpan, finishSpan, finishTrace, type TraceContext } from "./trace-context"
import { logger } from "./structured-logger"

export interface TracedOperation<T> {
  result: T
  trace: TraceContext
  durationMs: number
}

export async function traceOperation<T>(
  operationName: string,
  fn: (traceId: string) => Promise<T>,
  options?: { tenantId?: string; correlationId?: string; workflowId?: string; agentName?: string }
): Promise<TracedOperation<T>> {
  const trace = startTrace(operationName, options)
  const spanId = addSpan(trace.traceId, operationName, undefined, {
    ...(options?.agentName ? { agent: options.agentName } : {}),
  }).spanId
  const startMs = Date.now()

  try {
    const result = await fn(trace.traceId)
    finishSpan(trace.traceId, spanId, "ok")
    const finished = finishTrace(trace.traceId)
    logger.info(`${operationName} completed`, "runtime-tracer", {
      traceId: trace.traceId,
      correlationId: trace.correlationId,
      tenantId: options?.tenantId,
    })
    return { result, trace: finished ?? trace, durationMs: Date.now() - startMs }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    finishSpan(trace.traceId, spanId, "error", errorMessage)
    finishTrace(trace.traceId)
    logger.error(`${operationName} failed: ${errorMessage}`, "runtime-tracer", {
      traceId: trace.traceId,
      tenantId: options?.tenantId,
    })
    throw err
  }
}

export function traceSync<T>(
  operationName: string,
  fn: (traceId: string) => T,
  options?: { tenantId?: string; correlationId?: string }
): TracedOperation<T> {
  const trace = startTrace(operationName, options)
  const span = addSpan(trace.traceId, operationName)
  const startMs = Date.now()
  try {
    const result = fn(trace.traceId)
    finishSpan(trace.traceId, span.spanId, "ok")
    const finished = finishTrace(trace.traceId)
    return { result, trace: finished ?? trace, durationMs: Date.now() - startMs }
  } catch (err: unknown) {
    finishSpan(trace.traceId, span.spanId, "error", err instanceof Error ? err.message : String(err))
    finishTrace(trace.traceId)
    throw err
  }
}
