import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface CognitionAllocation {
  allocationId: string
  domain: string
  tenantId?: string
  assignedNodes: string[]
  cognitiveCapacity: number
  priority: "background" | "normal" | "urgent" | "critical"
  status: "active" | "idle" | "saturated"
  allocatedAt: string
  lastActivityAt?: string
}

const ALLOCATIONS: Map<string, CognitionAllocation> = new Map()
const MAX_ALLOCATIONS = 200

function cap(): void {
  if (ALLOCATIONS.size > MAX_ALLOCATIONS) {
    const firstKey = Array.from(ALLOCATIONS.keys())[0]
    if (firstKey !== undefined) ALLOCATIONS.delete(firstKey)
  }
}

export function allocateCognition(
  domain: string,
  nodes: string[],
  capacity: number,
  priority: CognitionAllocation["priority"],
  tenantId?: string,
): CognitionAllocation {
  if (isRuntimePaused()) {
    logger.warn("allocateCognition blocked: runtime paused", "cognition-cloud")
  }
  const allocation: CognitionAllocation = {
    allocationId: crypto.randomUUID(),
    domain,
    tenantId,
    assignedNodes: [...nodes],
    cognitiveCapacity: Math.max(0, Math.min(100, capacity)),
    priority,
    status: "active",
    allocatedAt: new Date().toISOString(),
  }
  ALLOCATIONS.set(allocation.allocationId, allocation)
  cap()
  logger.info(`Cognition allocated: ${domain}`, "cognition-cloud", {
    metadata: { allocationId: allocation.allocationId, capacity, priority },
  })
  return allocation
}

export function updateAllocationStatus(
  allocationId: string,
  status: CognitionAllocation["status"],
): void {
  const a = ALLOCATIONS.get(allocationId)
  if (!a) return
  a.status = status
}

export function recordActivity(allocationId: string): void {
  const a = ALLOCATIONS.get(allocationId)
  if (!a) return
  a.lastActivityAt = new Date().toISOString()
}

export function releaseAllocation(allocationId: string): void {
  ALLOCATIONS.delete(allocationId)
}

export function getActiveAllocations(domain?: string): CognitionAllocation[] {
  return Array.from(ALLOCATIONS.values()).filter(
    (a) =>
      a.status === "active" &&
      (domain === undefined || a.domain === domain),
  )
}

export function getAllocationStats(): {
  total: number
  active: number
  idle: number
  saturated: number
  totalCapacityReserved: number
} {
  const all = Array.from(ALLOCATIONS.values())
  const active = all.filter((a) => a.status === "active").length
  const idle = all.filter((a) => a.status === "idle").length
  const saturated = all.filter((a) => a.status === "saturated").length
  const totalCapacityReserved = all.reduce(
    (s, a) => s + a.cognitiveCapacity,
    0,
  )
  return { total: ALLOCATIONS.size, active, idle, saturated, totalCapacityReserved }
}
