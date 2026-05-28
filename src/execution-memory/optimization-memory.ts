import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface OptimizationRecord {
  optimizationId: string
  tenantId?: string
  workflowType: string
  optimizationType: string
  previousValue: unknown
  newValue: unknown
  expectedImprovement: number
  actualImprovement?: number
  appliedAt: string
  measuredAt?: string
  status: "applied" | "measured" | "reverted"
}

const OPTIMIZATION_HISTORY: OptimizationRecord[] = []
const CAP = 500

export function recordOptimization(
  workflowType: string,
  optimizationType: string,
  previousValue: unknown,
  newValue: unknown,
  expectedImprovement: number,
  tenantId?: string
): OptimizationRecord {
  if (isRuntimePaused()) {
    logger.warn("recordOptimization blocked — runtime paused", "optimization-memory", {
      metadata: { workflowType },
    })
    throw new Error("Runtime is paused")
  }
  if (OPTIMIZATION_HISTORY.length >= CAP) OPTIMIZATION_HISTORY.shift()
  const record: OptimizationRecord = {
    optimizationId: crypto.randomUUID(),
    tenantId,
    workflowType,
    optimizationType,
    previousValue,
    newValue,
    expectedImprovement,
    appliedAt: new Date().toISOString(),
    status: "applied",
  }
  OPTIMIZATION_HISTORY.push(record)
  return record
}

export function measureOutcome(optimizationId: string, actualImprovement: number): void {
  const record = OPTIMIZATION_HISTORY.find((o) => o.optimizationId === optimizationId)
  if (!record) return
  record.actualImprovement = actualImprovement
  record.measuredAt = new Date().toISOString()
  record.status = "measured"
}

export function revertOptimization(optimizationId: string): void {
  const record = OPTIMIZATION_HISTORY.find((o) => o.optimizationId === optimizationId)
  if (!record) return
  record.status = "reverted"
}

export function getBestOptimizations(workflowType: string): OptimizationRecord[] {
  return OPTIMIZATION_HISTORY
    .filter((o) => o.workflowType === workflowType && o.actualImprovement !== undefined)
    .sort((a, b) => (b.actualImprovement ?? 0) - (a.actualImprovement ?? 0))
}

export function getOptimizationSummary(): {
  total: number
  applied: number
  measured: number
  reverted: number
  avgActualImprovement: number
} {
  let applied = 0; let measured = 0; let reverted = 0; let totalImprovement = 0; let measuredCount = 0
  for (const o of OPTIMIZATION_HISTORY) {
    if (o.status === "applied") applied++
    else if (o.status === "measured") { measured++; totalImprovement += o.actualImprovement ?? 0; measuredCount++ }
    else reverted++
  }
  return {
    total: OPTIMIZATION_HISTORY.length,
    applied,
    measured,
    reverted,
    avgActualImprovement: measuredCount > 0 ? totalImprovement / measuredCount : 0,
  }
}
