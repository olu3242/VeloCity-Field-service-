import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface ResourceAllocation {
  allocationId: string
  workflowType: string
  tenantId?: string
  requestedCompute: number
  requestedMemoryMb: number
  allocatedCompute: number
  allocatedMemoryMb: number
  allocationRatio: number
  rebalanced: boolean
  rebalancedAt?: string
  allocatedAt: string
}

const ALLOCATIONS: ResourceAllocation[] = []
const ROLLING_CAP = 1000

export function allocate(
  workflowType: string,
  requestedCompute: number,
  requestedMemoryMb: number,
  tenantId?: string
): ResourceAllocation {
  if (isRuntimePaused()) {
    logger.warn("allocate blocked: runtime paused", { workflowType })
    throw new Error("Runtime is paused")
  }
  const allocatedCompute = Math.min(requestedCompute, 1000)
  const allocatedMemoryMb = Math.min(requestedMemoryMb, 4096)
  const allocationRatio =
    (allocatedCompute / Math.max(1, requestedCompute) +
      allocatedMemoryMb / Math.max(1, requestedMemoryMb)) /
    2
  const record: ResourceAllocation = {
    allocationId: crypto.randomUUID(),
    workflowType,
    tenantId,
    requestedCompute,
    requestedMemoryMb,
    allocatedCompute,
    allocatedMemoryMb,
    allocationRatio,
    rebalanced: false,
    allocatedAt: new Date().toISOString(),
  }
  ALLOCATIONS.push(record)
  if (ALLOCATIONS.length > ROLLING_CAP) ALLOCATIONS.shift()
  return record
}

export function rebalance(
  allocationId: string,
  newCompute: number,
  newMemoryMb: number
): void {
  if (isRuntimePaused()) {
    logger.warn("rebalance blocked: runtime paused", { allocationId })
    throw new Error("Runtime is paused")
  }
  const record = ALLOCATIONS.find((a) => a.allocationId === allocationId)
  if (!record) return
  record.allocatedCompute = Math.min(newCompute, 1000)
  record.allocatedMemoryMb = Math.min(newMemoryMb, 4096)
  record.allocationRatio =
    (record.allocatedCompute / Math.max(1, record.requestedCompute) +
      record.allocatedMemoryMb / Math.max(1, record.requestedMemoryMb)) /
    2
  record.rebalanced = true
  record.rebalancedAt = new Date().toISOString()
}

export function getActiveAllocations(tenantId?: string): ResourceAllocation[] {
  if (tenantId !== undefined) {
    return ALLOCATIONS.filter((a) => a.tenantId === tenantId)
  }
  return [...ALLOCATIONS]
}

export function getBalancerSummary(): {
  total: number
  rebalanced: number
  avgAllocationRatio: number
  totalComputeAllocated: number
} {
  const total = ALLOCATIONS.length
  const rebalanced = ALLOCATIONS.filter((a) => a.rebalanced).length
  const avgAllocationRatio =
    total > 0
      ? ALLOCATIONS.reduce((s, a) => s + a.allocationRatio, 0) / total
      : 0
  const totalComputeAllocated = ALLOCATIONS.reduce(
    (s, a) => s + a.allocatedCompute,
    0
  )
  return { total, rebalanced, avgAllocationRatio, totalComputeAllocated }
}
