import { logger } from "@/runtime-core/observability"

export interface FederationTraceHop {
  hopId: string
  traceId: string
  sourceFederationId: string
  targetFederationId: string
  tenantId?: string
  propagatedAt: string
  receivedAt?: string
  latencyMs?: number
  success: boolean
}

const HOPS: FederationTraceHop[] = []
const MAX_HOPS = 2000

export function propagateToFederation(
  traceId: string,
  sourceId: string,
  targetId: string,
  tenantId?: string
): FederationTraceHop {
  if (HOPS.length >= MAX_HOPS) HOPS.shift()

  const hop: FederationTraceHop = {
    hopId: crypto.randomUUID(),
    traceId,
    sourceFederationId: sourceId,
    targetFederationId: targetId,
    tenantId,
    propagatedAt: new Date().toISOString(),
    success: true,
  }

  HOPS.push(hop)
  logger.info(`Federation hop: ${sourceId} -> ${targetId}`, "federation-tracing")
  return hop
}

export function acknowledgeHop(hopId: string, latencyMs: number): void {
  const hop = HOPS.find((h) => h.hopId === hopId)
  if (!hop) return
  hop.receivedAt = new Date().toISOString()
  hop.latencyMs = latencyMs
  hop.success = true
}

export function failHop(hopId: string): void {
  const hop = HOPS.find((h) => h.hopId === hopId)
  if (!hop) return
  hop.success = false
  logger.warn(`Federation hop failed: ${hopId}`, "federation-tracing")
}

export function getHopsForTrace(traceId: string): FederationTraceHop[] {
  return HOPS.filter((h) => h.traceId === traceId)
}

export function getFederationTracingSummary(): {
  total: number
  successful: number
  failed: number
  avgLatencyMs: number
} {
  const total = HOPS.length
  const successful = HOPS.filter((h) => h.success).length
  const failed = total - successful
  const withLatency = HOPS.filter((h) => h.latencyMs !== undefined)
  const avgLatencyMs =
    withLatency.length > 0
      ? withLatency.reduce((sum, h) => sum + (h.latencyMs ?? 0), 0) / withLatency.length
      : 0
  return { total, successful, failed, avgLatencyMs }
}
