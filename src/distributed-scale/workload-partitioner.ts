import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface WorkloadPartition {
  partitionId: string
  workflowType: string
  tenantId?: string
  strategy: "hash" | "range" | "round_robin" | "affinity"
  nodeAssignments: Record<string, string[]>
  totalItems: number
  partitionCount: number
  balanceScore: number
  createdAt: string
}

const PARTITIONS: WorkloadPartition[] = []
const ROLLING_CAP = 500

function hashStr(s: string): number {
  return s.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
}

export function partitionWorkload(
  workflowType: string,
  items: string[],
  nodeIds: string[],
  strategy: WorkloadPartition["strategy"],
  tenantId?: string
): WorkloadPartition {
  if (isRuntimePaused()) {
    logger.warn("partitionWorkload blocked: runtime paused", { workflowType })
  }
  const nodeAssignments: Record<string, string[]> = {}
  for (const n of nodeIds) nodeAssignments[n] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let nodeIndex: number
    if (strategy === "hash") {
      nodeIndex = hashStr(item) % nodeIds.length
    } else {
      nodeIndex = i % nodeIds.length
    }
    const nodeId = nodeIds[nodeIndex]
    nodeAssignments[nodeId].push(item)
  }

  const totalItems = items.length
  const nodeCount = Math.max(1, nodeIds.length)
  const idealPerNode = totalItems / nodeCount
  const balanceScore = clampScore(
    100 -
      Math.abs(idealPerNode - Math.round(idealPerNode)) * 10
  )

  const record: WorkloadPartition = {
    partitionId: crypto.randomUUID(),
    workflowType,
    tenantId,
    strategy,
    nodeAssignments,
    totalItems,
    partitionCount: nodeIds.length,
    balanceScore,
    createdAt: new Date().toISOString(),
  }
  PARTITIONS.push(record)
  if (PARTITIONS.length > ROLLING_CAP) PARTITIONS.shift()
  return record
}

export function getPartition(
  workflowType: string
): WorkloadPartition | undefined {
  return PARTITIONS.find((p) => p.workflowType === workflowType)
}

export function getUnbalancedPartitions(): WorkloadPartition[] {
  return PARTITIONS.filter((p) => p.balanceScore < 60)
}

export function getPartitionSummary(): {
  total: number
  byStrategy: Record<string, number>
  avgBalance: number
  totalItems: number
} {
  const total = PARTITIONS.length
  const byStrategy: Record<string, number> = {}
  for (const p of PARTITIONS) {
    byStrategy[p.strategy] = (byStrategy[p.strategy] ?? 0) + 1
  }
  const avgBalance =
    total > 0 ? PARTITIONS.reduce((s, p) => s + p.balanceScore, 0) / total : 0
  const totalItems = PARTITIONS.reduce((s, p) => s + p.totalItems, 0)
  return { total, byStrategy, avgBalance, totalItems }
}
