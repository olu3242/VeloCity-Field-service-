import { logger } from "@/runtime-core/observability"

export interface ExecutionEnvelope {
  envelopeId: string
  executionId: string
  workflowType: string
  tenantId?: string
  correlationId: string
  causationId?: string
  traceId: string
  protocolVersion: string
  schemaVersion: string
  priority: "low" | "normal" | "high" | "critical"
  replaySafe: boolean
  federationSafe: boolean
  checksum: string
  emittedAt: string
  expiresAt?: string
  metadata: Record<string, unknown>
}

const ENVELOPES: Map<string, ExecutionEnvelope> = new Map()
const MAX_ENVELOPES = 5000

export function createEnvelope(
  executionId: string,
  workflowType: string,
  correlationId: string,
  traceId: string,
  options?: {
    tenantId?: string
    causationId?: string
    priority?: ExecutionEnvelope["priority"]
    replaySafe?: boolean
    federationSafe?: boolean
    expiresAt?: string
    metadata?: Record<string, unknown>
    protocolVersion?: string
    schemaVersion?: string
  }
): ExecutionEnvelope {
  const envelopeId = crypto.randomUUID()
  const envelope: ExecutionEnvelope = {
    envelopeId,
    executionId,
    workflowType,
    tenantId: options?.tenantId,
    correlationId,
    causationId: options?.causationId,
    traceId,
    protocolVersion: options?.protocolVersion ?? "1.0",
    schemaVersion: options?.schemaVersion ?? "1.0",
    priority: options?.priority ?? "normal",
    replaySafe: options?.replaySafe ?? true,
    federationSafe: options?.federationSafe ?? true,
    checksum: `${executionId}-${correlationId}`,
    emittedAt: new Date().toISOString(),
    expiresAt: options?.expiresAt,
    metadata: options?.metadata ?? {},
  }
  logger.debug(`Envelope created: ${envelopeId}`, "execution-envelope")
  return envelope
}

export function validateEnvelope(
  envelope: ExecutionEnvelope
): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  if (!envelope.envelopeId) issues.push("envelopeId is empty")
  if (!envelope.executionId) issues.push("executionId is empty")
  if (!envelope.correlationId) issues.push("correlationId is empty")
  if (!envelope.traceId) issues.push("traceId is empty")
  const expectedChecksum = `${envelope.executionId}-${envelope.correlationId}`
  if (envelope.checksum !== expectedChecksum) issues.push("checksum mismatch")
  return { valid: issues.length === 0, issues }
}

export function enrichEnvelope(
  envelope: ExecutionEnvelope,
  metadata: Record<string, unknown>
): ExecutionEnvelope {
  return { ...envelope, metadata: { ...envelope.metadata, ...metadata } }
}

export function storeEnvelope(envelope: ExecutionEnvelope): void {
  if (ENVELOPES.size >= MAX_ENVELOPES) {
    const firstKey = ENVELOPES.keys().next().value as string
    ENVELOPES.delete(firstKey)
  }
  ENVELOPES.set(envelope.envelopeId, envelope)
}

export function getEnvelope(envelopeId: string): ExecutionEnvelope | undefined {
  return ENVELOPES.get(envelopeId)
}
