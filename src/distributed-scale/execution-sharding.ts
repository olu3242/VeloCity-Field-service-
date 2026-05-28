import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ShardConfig {
  shardId: string
  shardIndex: number
  totalShards: number
  tenantId?: string
  responsibleRange: { start: string; end: string }
  activeExecutions: number
  maxExecutions: number
  healthy: boolean
  lastHeartbeatAt: string
  registeredAt: string
}

const SHARDS = new Map<string, ShardConfig>()
const CAP = 100

function hashStr(s: string): number {
  return s.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
}

export function registerShard(
  shardIndex: number,
  totalShards: number,
  rangeStart: string,
  rangeEnd: string,
  maxExecutions: number,
  tenantId?: string
): ShardConfig {
  if (isRuntimePaused()) {
    logger.warn("registerShard blocked: runtime paused", { shardIndex })
    throw new Error("Runtime is paused")
  }
  if (SHARDS.size >= CAP) {
    const firstKey = Array.from(SHARDS.keys())[0]
    SHARDS.delete(firstKey)
  }
  const now = new Date().toISOString()
  const shard: ShardConfig = {
    shardId: crypto.randomUUID(),
    shardIndex,
    totalShards,
    tenantId,
    responsibleRange: { start: rangeStart, end: rangeEnd },
    activeExecutions: 0,
    maxExecutions,
    healthy: true,
    lastHeartbeatAt: now,
    registeredAt: now,
  }
  SHARDS.set(shard.shardId, shard)
  return shard
}

export function heartbeat(shardId: string): void {
  const shard = SHARDS.get(shardId)
  if (!shard) return
  shard.lastHeartbeatAt = new Date().toISOString()
  shard.healthy = true
}

export function markUnhealthy(shardId: string): void {
  const shard = SHARDS.get(shardId)
  if (!shard) return
  shard.healthy = false
}

export function getShardForKey(key: string): ShardConfig | undefined {
  const allShards = Array.from(SHARDS.values())
  if (allShards.length === 0) return undefined
  const totalShards = allShards[0].totalShards
  const targetIndex = hashStr(key) % totalShards
  return allShards.find((s) => s.shardIndex === targetIndex)
}

export function getHealthyShards(): ShardConfig[] {
  return Array.from(SHARDS.values()).filter((s) => s.healthy)
}

export function getShardingSummary(): {
  total: number
  healthy: number
  unhealthy: number
  avgLoad: number
  totalCapacity: number
} {
  const values = Array.from(SHARDS.values())
  const total = values.length
  const healthy = values.filter((s) => s.healthy).length
  const unhealthy = total - healthy
  const avgLoad =
    total > 0 ? values.reduce((s, v) => s + v.activeExecutions, 0) / total : 0
  const totalCapacity = values.reduce((s, v) => s + v.maxExecutions, 0)
  return { total, healthy, unhealthy, avgLoad, totalCapacity }
}
