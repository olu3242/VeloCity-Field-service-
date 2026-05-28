import { logger } from "@/runtime-core/observability"

export type PartitionStatus = "active" | "draining" | "offline" | "overloaded"

export interface ExecutionPartition {
  partitionId: string
  region: string
  status: PartitionStatus
  capacity: number
  used: number
  affinityTags: string[]
  registeredAt: string
  lastHeartbeatAt: string
}

const PARTITIONS: Map<string, ExecutionPartition> = new Map()
const PARTITION_CAP = 100

export function registerPartition(
  region: string,
  capacity: number,
  affinityTags: string[] = [],
): ExecutionPartition {
  if (PARTITIONS.size >= PARTITION_CAP) {
    const oldest = Array.from(PARTITIONS.keys())[0]
    if (oldest !== undefined) PARTITIONS.delete(oldest)
  }
  const partition: ExecutionPartition = {
    partitionId: crypto.randomUUID(),
    region,
    status: "active",
    capacity,
    used: 0,
    affinityTags,
    registeredAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
  }
  PARTITIONS.set(partition.partitionId, partition)
  logger.info(`Partition registered in region ${region}`, "partition-manager", {
    metadata: { partitionId: partition.partitionId, capacity },
  })
  return partition
}

export function updatePartitionHealth(
  partitionId: string,
  used: number,
  status?: PartitionStatus,
): void {
  const p = PARTITIONS.get(partitionId)
  if (!p) return
  p.used = used
  p.lastHeartbeatAt = new Date().toISOString()
  if (status !== undefined) p.status = status
}

export function drainPartition(partitionId: string): void {
  const p = PARTITIONS.get(partitionId)
  if (!p) return
  p.status = "draining"
  logger.info(`Partition draining`, "partition-manager", { metadata: { partitionId } })
}

export function getAvailablePartitions(region?: string): ExecutionPartition[] {
  return Array.from(PARTITIONS.values()).filter(
    (p) => p.status === "active" && (region === undefined || p.region === region),
  )
}

export function getBestPartition(
  workflowType: string,
  tenantId?: string,
): ExecutionPartition | undefined {
  const available = Array.from(PARTITIONS.values()).filter((p) => p.status === "active")
  if (available.length === 0) return undefined

  const withAffinity = available.filter(
    (p) =>
      (tenantId !== undefined && p.affinityTags.includes(tenantId)) ||
      p.affinityTags.includes(workflowType),
  )
  const pool = withAffinity.length > 0 ? withAffinity : available
  return pool.reduce((best, p) => {
    const bRatio = best.capacity > 0 ? best.used / best.capacity : 1
    const pRatio = p.capacity > 0 ? p.used / p.capacity : 1
    return pRatio < bRatio ? p : best
  })
}

export function getPartitionReport(): {
  total: number
  byStatus: Record<string, number>
  byRegion: Record<string, number>
  globalUsedPct: number
} {
  const values = Array.from(PARTITIONS.values())
  const byStatus: Record<string, number> = {}
  const byRegion: Record<string, number> = {}
  let totalCap = 0
  let totalUsed = 0
  for (const p of values) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
    byRegion[p.region] = (byRegion[p.region] ?? 0) + 1
    totalCap += p.capacity
    totalUsed += p.used
  }
  return {
    total: PARTITIONS.size,
    byStatus,
    byRegion,
    globalUsedPct: totalCap > 0 ? totalUsed / totalCap : 0,
  }
}
