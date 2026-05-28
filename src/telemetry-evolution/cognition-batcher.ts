import { logger } from "@/runtime-core/observability"

export interface TelemetryBatch {
  batchId: string
  subsystem: string
  tenantId?: string
  events: Record<string, unknown>[]
  batchSize: number
  maxBatchSize: number
  status: "open" | "flushing" | "flushed" | "failed"
  createdAt: string
  flushedAt?: string
  estimatedSavingMs: number
}

const BATCHES = new Map<string, TelemetryBatch>()
const MAX_BATCHES = 500
const MAX_BATCH_SIZE = 50

export function openBatch(subsystem: string, tenantId?: string): TelemetryBatch {
  if (BATCHES.size >= MAX_BATCHES) {
    const oldest = Array.from(BATCHES.keys())[0]
    BATCHES.delete(oldest)
  }

  const batch: TelemetryBatch = {
    batchId: crypto.randomUUID(),
    subsystem,
    tenantId,
    events: [],
    batchSize: 0,
    maxBatchSize: MAX_BATCH_SIZE,
    status: "open",
    createdAt: new Date().toISOString(),
    estimatedSavingMs: 0,
  }

  BATCHES.set(batch.batchId, batch)
  logger.info("Batch opened", { batchId: batch.batchId, subsystem })
  return batch
}

export function addEvent(batchId: string, event: Record<string, unknown>): boolean {
  const batch = BATCHES.get(batchId)
  if (!batch || batch.status !== "open") return false
  if (batch.batchSize >= batch.maxBatchSize) return false

  batch.events.push(event)
  batch.batchSize++

  if (batch.batchSize >= batch.maxBatchSize) {
    batch.status = "flushing"
  }

  return true
}

export function flushBatch(batchId: string): void {
  const batch = BATCHES.get(batchId)
  if (!batch) return
  batch.status = "flushed"
  batch.flushedAt = new Date().toISOString()
  batch.estimatedSavingMs = batch.batchSize * 2
  logger.info("Batch flushed", { batchId, batchSize: batch.batchSize })
}

export function failBatch(batchId: string): void {
  const batch = BATCHES.get(batchId)
  if (!batch) return
  batch.status = "failed"
  logger.warn("Batch failed", { batchId })
}

export function getOpenBatch(subsystem: string, tenantId?: string): TelemetryBatch | undefined {
  return Array.from(BATCHES.values()).find(
    (b) => b.subsystem === subsystem && b.tenantId === tenantId && b.status === "open"
  )
}

export function getBatchStats(): {
  total: number
  flushed: number
  failed: number
  avgBatchSize: number
  totalSavingMs: number
} {
  const all = Array.from(BATCHES.values())
  const total = all.length
  const avgBatchSize = total > 0 ? all.reduce((s, b) => s + b.batchSize, 0) / total : 0
  return {
    total,
    flushed: all.filter((b) => b.status === "flushed").length,
    failed: all.filter((b) => b.status === "failed").length,
    avgBatchSize,
    totalSavingMs: all.reduce((s, b) => s + b.estimatedSavingMs, 0),
  }
}
