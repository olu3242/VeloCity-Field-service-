export interface DistributedQueue {
  id: string
  queueType: "primary" | "priority" | "dead_letter" | "retry" | "regional"
  region: string
  depth: number
  capacity: number
  processingRate: number
  errorRate: number
  status: "active" | "draining" | "paused" | "overflow"
  lastUpdatedAt: string
}

const QUEUES: Map<string, DistributedQueue> = new Map()
const QUEUE_CAP = 50

function preRegister(): void {
  const seeds: Array<Omit<DistributedQueue, "depth" | "processingRate" | "errorRate" | "status" | "lastUpdatedAt">> = [
    { id: "primary-us-east", queueType: "primary", region: "us-east", capacity: 10000 },
    { id: "priority-us-east", queueType: "priority", region: "us-east", capacity: 5000 },
    { id: "dlq-global", queueType: "dead_letter", region: "global", capacity: 2000 },
  ]
  for (const s of seeds) {
    QUEUES.set(s.id, {
      ...s,
      depth: 0,
      processingRate: 0,
      errorRate: 0,
      status: "active",
      lastUpdatedAt: new Date().toISOString(),
    })
  }
}
preRegister()

export function registerQueue(
  id: string,
  queueType: DistributedQueue["queueType"],
  region: string,
  capacity: number,
): DistributedQueue {
  if (QUEUES.size >= QUEUE_CAP) {
    const oldest = Array.from(QUEUES.keys())[0]
    if (oldest) QUEUES.delete(oldest)
  }
  const queue: DistributedQueue = {
    id,
    queueType,
    region,
    depth: 0,
    capacity,
    processingRate: 0,
    errorRate: 0,
    status: "active",
    lastUpdatedAt: new Date().toISOString(),
  }
  QUEUES.set(id, queue)
  return queue
}

export function updateQueueMetrics(
  id: string,
  depth: number,
  processingRate: number,
  errorRate: number,
): void {
  const q = QUEUES.get(id)
  if (!q) return
  const ratio = q.capacity > 0 ? depth / q.capacity : 0
  const status: DistributedQueue["status"] = ratio >= 0.9 ? "overflow" : "active"
  QUEUES.set(id, { ...q, depth, processingRate, errorRate, status, lastUpdatedAt: new Date().toISOString() })
}

export function getQueuesByRegion(region: string): DistributedQueue[] {
  return Array.from(QUEUES.values()).filter((q) => q.region === region)
}

export function getOverflowQueues(): DistributedQueue[] {
  return Array.from(QUEUES.values()).filter(
    (q) => q.capacity > 0 && q.depth / q.capacity > 0.9,
  )
}

export function getQueueFabricHealth(): {
  totalQueues: number
  activeQueues: number
  overflowQueues: number
  avgErrorRate: number
} {
  const all = Array.from(QUEUES.values())
  const active = all.filter((q) => q.status === "active").length
  const overflow = all.filter((q) => q.status === "overflow").length
  const avgErrorRate = all.length > 0
    ? all.reduce((s, q) => s + q.errorRate, 0) / all.length
    : 0
  return { totalQueues: all.length, activeQueues: active, overflowQueues: overflow, avgErrorRate }
}
