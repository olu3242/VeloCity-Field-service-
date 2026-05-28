export interface EventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  envelopeId: string          // unique per emission
  correlationId: string       // links related events (e.g. same job flow)
  causationId?: string        // id of event that caused this one
  traceId: string             // distributed trace id
  eventType: string
  tenantId?: string
  source: string              // module/component that emitted
  payload: T
  priority: "low" | "normal" | "high" | "critical"
  retryCount: number
  emittedAt: string
  schemaVersion: "1.0"
}

export function createEnvelope<T extends Record<string, unknown>>(
  eventType: string,
  source: string,
  payload: T,
  options?: {
    tenantId?: string
    correlationId?: string
    causationId?: string
    traceId?: string
    priority?: "low" | "normal" | "high" | "critical"
  }
): EventEnvelope<T> {
  return {
    envelopeId: crypto.randomUUID(),
    correlationId: options?.correlationId ?? crypto.randomUUID(),
    causationId: options?.causationId,
    traceId: options?.traceId ?? crypto.randomUUID(),
    eventType,
    tenantId: options?.tenantId,
    source,
    payload,
    priority: options?.priority ?? "normal",
    retryCount: 0,
    emittedAt: new Date().toISOString(),
    schemaVersion: "1.0",
  }
}

export function incrementRetry(envelope: EventEnvelope): EventEnvelope {
  return { ...envelope, retryCount: envelope.retryCount + 1 }
}

export function withCausation(envelope: EventEnvelope, causationId: string): EventEnvelope {
  return { ...envelope, causationId }
}
