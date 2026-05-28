import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface FederatedNeuralExchange {
  exchangeId: string
  federationId: string
  exchangeType:
    | "signal_relay"
    | "model_sync"
    | "cognition_share"
    | "intelligence_broadcast"
  sourceCloudId: string
  targetCloudId?: string
  payloadSummary: string
  trustRequired: "low" | "medium" | "high"
  status: "pending" | "relayed" | "received" | "rejected"
  initiatedAt: string
  completedAt?: string
}

const EXCHANGES: FederatedNeuralExchange[] = []
const MAX_EXCHANGES = 1000

function cap(): void {
  while (EXCHANGES.length > MAX_EXCHANGES) EXCHANGES.shift()
}

export function initiateExchange(
  federationId: string,
  type: FederatedNeuralExchange["exchangeType"],
  sourceCloudId: string,
  payloadSummary: string,
  trust: FederatedNeuralExchange["trustRequired"],
  targetCloudId?: string,
): FederatedNeuralExchange {
  if (isRuntimePaused()) {
    logger.warn("initiateExchange blocked: runtime paused", "federated-neural-network")
  }
  const exchange: FederatedNeuralExchange = {
    exchangeId: crypto.randomUUID(),
    federationId,
    exchangeType: type,
    sourceCloudId,
    targetCloudId,
    payloadSummary,
    trustRequired: trust,
    status: "pending",
    initiatedAt: new Date().toISOString(),
  }
  EXCHANGES.push(exchange)
  cap()
  logger.info(`Federated exchange initiated: ${type}`, "federated-neural-network", {
    metadata: { exchangeId: exchange.exchangeId, federationId },
  })
  return exchange
}

export function relayExchange(exchangeId: string): void {
  const e = EXCHANGES.find((x) => x.exchangeId === exchangeId)
  if (!e) return
  e.status = "relayed"
  e.completedAt = new Date().toISOString()
}

export function receiveExchange(exchangeId: string): void {
  const e = EXCHANGES.find((x) => x.exchangeId === exchangeId)
  if (!e) return
  e.status = "received"
  e.completedAt = new Date().toISOString()
}

export function rejectExchange(exchangeId: string): void {
  const e = EXCHANGES.find((x) => x.exchangeId === exchangeId)
  if (!e) return
  e.status = "rejected"
  e.completedAt = new Date().toISOString()
}

export function getExchangeStats(): {
  total: number
  byType: Record<string, number>
  byStatus: Record<string, number>
  federationCount: number
} {
  const byType: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  const federations = new Set<string>()
  for (const e of EXCHANGES) {
    byType[e.exchangeType] = (byType[e.exchangeType] ?? 0) + 1
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
    federations.add(e.federationId)
  }
  return {
    total: EXCHANGES.length,
    byType,
    byStatus,
    federationCount: federations.size,
  }
}
