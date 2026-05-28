import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface QueueCoordinationRecord {
  coordinationId: string
  queueId: string
  tenantId?: string
  producerCount: number
  consumerCount: number
  messageCount: number
  processingRatePerSec: number
  backpressureActive: boolean
  assignedCoordinator: string
  coordinatedAt: string
}

const RECORDS: QueueCoordinationRecord[] = []
const ROLLING_CAP = 500

export function coordinate(
  queueId: string,
  producerCount: number,
  consumerCount: number,
  messageCount: number,
  tenantId?: string
): QueueCoordinationRecord {
  if (isRuntimePaused()) {
    logger.warn("coordinate blocked: runtime paused", { queueId })
    throw new Error("Runtime is paused")
  }
  const processingRatePerSec = consumerCount * 10
  const backpressureActive = messageCount > consumerCount * 100
  const assignedCoordinator = `coord-${queueId.slice(0, 8)}`
  const record: QueueCoordinationRecord = {
    coordinationId: crypto.randomUUID(),
    queueId,
    tenantId,
    producerCount,
    consumerCount,
    messageCount,
    processingRatePerSec,
    backpressureActive,
    assignedCoordinator,
    coordinatedAt: new Date().toISOString(),
  }
  RECORDS.push(record)
  if (RECORDS.length > ROLLING_CAP) RECORDS.shift()
  return record
}

export function getCoordination(
  queueId: string
): QueueCoordinationRecord | undefined {
  return RECORDS.find((r) => r.queueId === queueId)
}

export function getBackpressuredQueues(): QueueCoordinationRecord[] {
  return RECORDS.filter((r) => r.backpressureActive)
}

export function getCoordinationSummary(): {
  total: number
  backpressureCount: number
  avgConsumers: number
  avgMessageCount: number
} {
  const total = RECORDS.length
  const backpressureCount = RECORDS.filter((r) => r.backpressureActive).length
  const avgConsumers =
    total > 0 ? RECORDS.reduce((s, r) => s + r.consumerCount, 0) / total : 0
  const avgMessageCount =
    total > 0 ? RECORDS.reduce((s, r) => s + r.messageCount, 0) / total : 0
  return { total, backpressureCount, avgConsumers, avgMessageCount }
}
