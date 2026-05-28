import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface WorkloadAdaptation {
  adaptationId: string
  triggerSignal: string
  targetPartitionId?: string
  action: "shift_load" | "reduce_load" | "increase_capacity" | "drain" | "rebalance"
  magnitude: number
  tenantId?: string
  status: "pending" | "applying" | "applied" | "failed" | "reverted"
  estimatedImpact: string
  appliedAt?: string
  createdAt: string
}

const ADAPTATIONS: WorkloadAdaptation[] = []
const CAP = 500

export function adaptWorkload(
  signal: string,
  action: WorkloadAdaptation["action"],
  magnitude: number,
  targetPartitionId?: string,
  tenantId?: string
): WorkloadAdaptation {
  if (isRuntimePaused()) {
    logger.warn("adaptWorkload blocked: runtime paused", "workload-adaptation")
    throw new Error("Runtime is paused")
  }
  if (ADAPTATIONS.length >= CAP) ADAPTATIONS.shift()
  const record: WorkloadAdaptation = {
    adaptationId: crypto.randomUUID(),
    triggerSignal: signal,
    targetPartitionId,
    action,
    magnitude: Math.max(0, Math.min(100, magnitude)),
    tenantId,
    status: "pending",
    estimatedImpact: `${action} with magnitude ${magnitude}`,
    createdAt: new Date().toISOString(),
  }
  ADAPTATIONS.push(record)
  return record
}

function findById(id: string): WorkloadAdaptation | undefined {
  return ADAPTATIONS.find(a => a.adaptationId === id)
}

export function applyAdaptation(adaptationId: string): void {
  const a = findById(adaptationId)
  if (a) { a.status = "applying"; a.appliedAt = new Date().toISOString() }
}

export function revertAdaptation(adaptationId: string): void {
  const a = findById(adaptationId)
  if (a) a.status = "reverted"
}

export function failAdaptation(adaptationId: string): void {
  const a = findById(adaptationId)
  if (a) a.status = "failed"
}

export function getActiveAdaptations(): WorkloadAdaptation[] {
  return ADAPTATIONS.filter(a => a.status === "pending" || a.status === "applying")
}

export function getAdaptationStats(): {
  total: number
  byAction: Record<string, number>
  byStatus: Record<string, number>
  avgMagnitude: number
} {
  const byAction: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let totalMag = 0
  for (const a of ADAPTATIONS) {
    byAction[a.action] = (byAction[a.action] ?? 0) + 1
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
    totalMag += a.magnitude
  }
  return {
    total: ADAPTATIONS.length,
    byAction,
    byStatus,
    avgMagnitude: ADAPTATIONS.length > 0 ? totalMag / ADAPTATIONS.length : 0,
  }
}
