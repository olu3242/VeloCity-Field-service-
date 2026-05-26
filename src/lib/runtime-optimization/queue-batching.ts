export interface BatchConfig {
  maxBatchSize: number;
  maxWaitMs: number;
  eventType?: string;
}

export interface EventBatch {
  id: string;
  eventType: string;
  items: Array<{
    eventId: string;
    payload: Record<string, unknown>;
    queuedAt: string;
  }>;
  createdAt: string;
  flushedAt?: string;
  size: number;
}

const PENDING_BATCHES: Map<string, EventBatch> = new Map();
const FLUSHED_BATCHES: EventBatch[] = [];
const FLUSHED_CAP = 100;

const DEFAULT_CONFIG: BatchConfig = { maxBatchSize: 10, maxWaitMs: 5_000 };

function makeBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addToBatch(
  eventType: string,
  eventId: string,
  payload: Record<string, unknown>
): EventBatch {
  let batch = PENDING_BATCHES.get(eventType);
  if (!batch) {
    batch = {
      id: makeBatchId(),
      eventType,
      items: [],
      createdAt: new Date().toISOString(),
      size: 0,
    };
    PENDING_BATCHES.set(eventType, batch);
  }

  batch.items.push({ eventId, payload, queuedAt: new Date().toISOString() });
  batch.size = batch.items.length;

  if (batch.size >= DEFAULT_CONFIG.maxBatchSize) {
    flushBatch(eventType);
  }

  return PENDING_BATCHES.get(eventType) ?? batch;
}

export function flushBatch(eventType: string): EventBatch | undefined {
  const batch = PENDING_BATCHES.get(eventType);
  if (!batch) return undefined;

  batch.flushedAt = new Date().toISOString();
  FLUSHED_BATCHES.push(batch);
  if (FLUSHED_BATCHES.length > FLUSHED_CAP) {
    FLUSHED_BATCHES.shift();
  }

  PENDING_BATCHES.delete(eventType);
  return batch;
}

export function flushStaleBatches(): number {
  const now = Date.now();
  let count = 0;
  for (const [eventType, batch] of Array.from(PENDING_BATCHES.entries())) {
    const age = now - new Date(batch.createdAt).getTime();
    if (age >= DEFAULT_CONFIG.maxWaitMs) {
      flushBatch(eventType);
      count += 1;
    }
  }
  return count;
}

export function getPendingBatches(): EventBatch[] {
  return Array.from(PENDING_BATCHES.values());
}

export function getBatchStats(): {
  pendingBatches: number;
  flushedBatches: number;
  avgBatchSize: number;
} {
  const pendingBatches = PENDING_BATCHES.size;
  const flushedBatches = FLUSHED_BATCHES.length;
  const totalItems = FLUSHED_BATCHES.reduce((sum, b) => sum + b.size, 0);
  const avgBatchSize =
    flushedBatches > 0 ? Math.round(totalItems / flushedBatches) : 0;
  return { pendingBatches, flushedBatches, avgBatchSize };
}
