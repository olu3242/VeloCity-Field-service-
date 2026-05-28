import { type EventEnvelope } from "./event-envelope"
import { getEventPriority } from "./canonical-events"

export interface EventRegistryEntry {
  envelopeId: string
  eventType: string
  tenantId?: string
  correlationId: string
  priority: "low" | "normal" | "high" | "critical"
  retryCount: number
  emittedAt: string
  processedAt?: string
  status: "emitted" | "processing" | "processed" | "failed"
}

const REGISTRY: EventRegistryEntry[] = []
const MAX_REGISTRY = 2000

export function registerEmission(envelope: EventEnvelope): EventRegistryEntry {
  if (REGISTRY.length >= MAX_REGISTRY) REGISTRY.shift()
  const entry: EventRegistryEntry = {
    envelopeId: envelope.envelopeId,
    eventType: envelope.eventType,
    tenantId: envelope.tenantId,
    correlationId: envelope.correlationId,
    priority: envelope.priority ?? getEventPriority(envelope.eventType),
    retryCount: envelope.retryCount,
    emittedAt: envelope.emittedAt,
    status: "emitted",
  }
  REGISTRY.push(entry)
  return entry
}

export function markProcessed(envelopeId: string): void {
  const entry = REGISTRY.find((e) => e.envelopeId === envelopeId)
  if (entry) {
    entry.status = "processed"
    entry.processedAt = new Date().toISOString()
  }
}

export function markFailed(envelopeId: string): void {
  const entry = REGISTRY.find((e) => e.envelopeId === envelopeId)
  if (entry) entry.status = "failed"
}

export function getEventsByCorrelation(correlationId: string): EventRegistryEntry[] {
  return REGISTRY.filter((e) => e.correlationId === correlationId)
}

export function getRegistryStats(): {
  total: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
} {
  const byStatus: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  for (const e of REGISTRY) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
    byPriority[e.priority] = (byPriority[e.priority] ?? 0) + 1
  }
  return { total: REGISTRY.length, byStatus, byPriority }
}
