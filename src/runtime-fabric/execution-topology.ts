import { logger } from "@/runtime-core/observability"

export interface TopologyEntry {
  entryId: string
  executionId: string
  workflowId: string
  partitionId: string
  region: string
  tenantId?: string
  workflowType: string
  startedAt: string
  lastUpdatedAt: string
  hops: string[]
}

const TOPOLOGY: Map<string, TopologyEntry> = new Map()
const TOPOLOGY_CAP = 3000

export function registerExecution(
  executionId: string,
  workflowId: string,
  workflowType: string,
  partitionId: string,
  region: string,
  tenantId?: string,
): TopologyEntry {
  if (TOPOLOGY.size >= TOPOLOGY_CAP) {
    const oldest = Array.from(TOPOLOGY.keys())[0]
    if (oldest !== undefined) TOPOLOGY.delete(oldest)
  }
  const entry: TopologyEntry = {
    entryId: crypto.randomUUID(),
    executionId,
    workflowId,
    partitionId,
    region,
    tenantId,
    workflowType,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    hops: [partitionId],
  }
  TOPOLOGY.set(executionId, entry)
  logger.debug("Execution registered in topology", "execution-topology", {
    metadata: { executionId, workflowId, partitionId, region },
  })
  return entry
}

export function recordHop(executionId: string, newPartitionId: string, newRegion: string): void {
  const entry = TOPOLOGY.get(executionId)
  if (!entry) return
  entry.partitionId = newPartitionId
  entry.region = newRegion
  entry.hops.push(newPartitionId)
  entry.lastUpdatedAt = new Date().toISOString()
}

export function completeExecution(executionId: string): void {
  TOPOLOGY.delete(executionId)
}

export function getTopologyByRegion(region: string): TopologyEntry[] {
  return Array.from(TOPOLOGY.values()).filter((e) => e.region === region)
}

export function getTopologySummary(): {
  active: number
  byRegion: Record<string, number>
  multiHopCount: number
} {
  const entries = Array.from(TOPOLOGY.values())
  const byRegion: Record<string, number> = {}
  let multiHopCount = 0
  for (const e of entries) {
    byRegion[e.region] = (byRegion[e.region] ?? 0) + 1
    if (e.hops.length > 1) multiHopCount++
  }
  return { active: TOPOLOGY.size, byRegion, multiHopCount }
}
