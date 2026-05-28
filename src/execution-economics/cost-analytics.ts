import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface ExecutionCostRecord {
  recordId: string
  executionId: string
  workflowType: string
  tenantId?: string
  computeUnits: number
  memoryMb: number
  durationMs: number
  estimatedCostUsd: number
  costPerStep: number
  stepCount: number
  efficiencyScore: number
  recordedAt: string
}

const RECORDS: ExecutionCostRecord[] = []
const ROLLING_CAP = 2000

export function recordCost(
  executionId: string,
  workflowType: string,
  computeUnits: number,
  memoryMb: number,
  durationMs: number,
  stepCount: number,
  tenantId?: string
): ExecutionCostRecord {
  if (isRuntimePaused()) {
    logger.warn("recordCost blocked: runtime paused", { executionId })
  }
  const estimatedCostUsd =
    computeUnits * 0.00001 + (memoryMb * 0.000001 * durationMs) / 1000
  const costPerStep =
    stepCount > 0 ? estimatedCostUsd / stepCount : estimatedCostUsd
  const efficiencyScore = clampScore(100 - estimatedCostUsd * 1000)
  const record: ExecutionCostRecord = {
    recordId: crypto.randomUUID(),
    executionId,
    workflowType,
    tenantId,
    computeUnits,
    memoryMb,
    durationMs,
    estimatedCostUsd,
    costPerStep,
    stepCount,
    efficiencyScore,
    recordedAt: new Date().toISOString(),
  }
  RECORDS.push(record)
  if (RECORDS.length > ROLLING_CAP) RECORDS.shift()
  return record
}

export function getCostRecord(
  executionId: string
): ExecutionCostRecord | undefined {
  return RECORDS.find((r) => r.executionId === executionId)
}

export function getMostExpensiveExecutions(
  limit = 10
): ExecutionCostRecord[] {
  return [...RECORDS]
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, limit)
}

export function getCostSummary(): {
  total: number
  totalCostUsd: number
  avgCostUsd: number
  avgEfficiency: number
  byWorkflowType: Record<string, number>
} {
  const total = RECORDS.length
  const totalCostUsd = RECORDS.reduce((s, r) => s + r.estimatedCostUsd, 0)
  const avgCostUsd = total > 0 ? totalCostUsd / total : 0
  const avgEfficiency =
    total > 0
      ? RECORDS.reduce((s, r) => s + r.efficiencyScore, 0) / total
      : 0
  const byWorkflowType: Record<string, number> = {}
  for (const r of RECORDS) {
    byWorkflowType[r.workflowType] =
      (byWorkflowType[r.workflowType] ?? 0) + r.estimatedCostUsd
  }
  return { total, totalCostUsd, avgCostUsd, avgEfficiency, byWorkflowType }
}
