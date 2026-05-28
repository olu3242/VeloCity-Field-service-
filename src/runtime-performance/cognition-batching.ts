export interface CognitionBatch {
  batchId: string
  tenantId?: string
  domain: string
  taskIds: string[]
  batchSize: number
  estimatedSavingMs: number
  status: "open" | "processing" | "completed" | "failed"
  createdAt: string
  processedAt?: string
}

const BATCHES: Map<string, CognitionBatch> = new Map()
const CAP = 500
const MAX_TASKS_PER_BATCH = 20

function enforceCap(): void {
  if (BATCHES.size >= CAP) {
    const firstKey = Array.from(BATCHES.keys())[0]
    if (firstKey !== undefined) BATCHES.delete(firstKey)
  }
}

export function createBatch(domain: string, tenantId?: string): CognitionBatch {
  enforceCap()
  const batch: CognitionBatch = {
    batchId: crypto.randomUUID(),
    tenantId,
    domain,
    taskIds: [],
    batchSize: 0,
    estimatedSavingMs: 0,
    status: "open",
    createdAt: new Date().toISOString(),
  }
  BATCHES.set(batch.batchId, batch)
  return batch
}

export function addTask(batchId: string, taskId: string): boolean {
  const batch = BATCHES.get(batchId)
  if (!batch || batch.taskIds.length >= MAX_TASKS_PER_BATCH) return false
  batch.taskIds.push(taskId)
  batch.batchSize = batch.taskIds.length
  return true
}

export function closeBatch(batchId: string): void {
  const batch = BATCHES.get(batchId)
  if (batch) batch.status = "processing"
}

export function completeBatch(batchId: string): void {
  const batch = BATCHES.get(batchId)
  if (!batch) return
  batch.estimatedSavingMs = batch.taskIds.length * 5
  batch.status = "completed"
  batch.processedAt = new Date().toISOString()
}

export function failBatch(batchId: string): void {
  const batch = BATCHES.get(batchId)
  if (batch) {
    batch.status = "failed"
    batch.processedAt = new Date().toISOString()
  }
}

export function getOpenBatch(
  domain: string,
  tenantId?: string,
): CognitionBatch | undefined {
  return Array.from(BATCHES.values()).find(
    (b) =>
      b.status === "open" &&
      b.domain === domain &&
      b.tenantId === tenantId,
  )
}

export function getBatchStats(): {
  total: number
  completed: number
  failed: number
  avgBatchSize: number
  totalSavingMs: number
} {
  const all = Array.from(BATCHES.values())
  const completed = all.filter((b) => b.status === "completed").length
  const failed = all.filter((b) => b.status === "failed").length
  const totalSize = all.reduce((s, b) => s + b.batchSize, 0)
  const totalSavingMs = all.reduce((s, b) => s + b.estimatedSavingMs, 0)
  return {
    total: all.length,
    completed,
    failed,
    avgBatchSize: all.length > 0 ? totalSize / all.length : 0,
    totalSavingMs,
  }
}
