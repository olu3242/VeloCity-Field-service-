import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface WorkflowEconomics {
  economicsId: string
  workflowType: string
  tenantId?: string
  avgDurationMs: number
  avgCostUsd: number
  successRate: number
  throughputPerHour: number
  costPerSuccessUsd: number
  economicsScore: number
  tier: "premium" | "standard" | "economy" | "inefficient"
  calculatedAt: string
}

const ECONOMICS = new Map<string, WorkflowEconomics>()
const CAP = 500

function resolveTier(score: number): WorkflowEconomics["tier"] {
  if (score >= 80) return "premium"
  if (score >= 60) return "standard"
  if (score >= 40) return "economy"
  return "inefficient"
}

export function calculateEconomics(
  workflowType: string,
  avgDurationMs: number,
  avgCostUsd: number,
  successRate: number,
  throughputPerHour: number,
  tenantId?: string
): WorkflowEconomics {
  if (isRuntimePaused()) {
    logger.warn("calculateEconomics blocked: runtime paused", { workflowType })
  }
  const costPerSuccessUsd = avgCostUsd / Math.max(0.01, successRate)
  const economicsScore = clampScore(
    successRate * 100 * 0.4 +
      Math.min(100, throughputPerHour) * 0.3 +
      (100 - Math.min(100, avgCostUsd * 1000)) * 0.3
  )
  const tier = resolveTier(economicsScore)
  if (ECONOMICS.size >= CAP && !ECONOMICS.has(workflowType)) {
    const firstKey = Array.from(ECONOMICS.keys())[0]
    ECONOMICS.delete(firstKey)
  }
  const record: WorkflowEconomics = {
    economicsId: crypto.randomUUID(),
    workflowType,
    tenantId,
    avgDurationMs,
    avgCostUsd,
    successRate,
    throughputPerHour,
    costPerSuccessUsd,
    economicsScore,
    tier,
    calculatedAt: new Date().toISOString(),
  }
  ECONOMICS.set(workflowType, record)
  return record
}

export function getEconomics(workflowType: string): WorkflowEconomics | undefined {
  return ECONOMICS.get(workflowType)
}

export function getInefficientWorkflows(): WorkflowEconomics[] {
  return Array.from(ECONOMICS.values()).filter((e) => e.tier === "inefficient")
}

export function getEconomicsSummary(): {
  total: number
  byTier: Record<string, number>
  avgScore: number
  totalThroughput: number
} {
  const values = Array.from(ECONOMICS.values())
  const total = values.length
  const byTier: Record<string, number> = {}
  for (const e of values) {
    byTier[e.tier] = (byTier[e.tier] ?? 0) + 1
  }
  const avgScore =
    total > 0 ? values.reduce((s, e) => s + e.economicsScore, 0) / total : 0
  const totalThroughput = values.reduce((s, e) => s + e.throughputPerHour, 0)
  return { total, byTier, avgScore, totalThroughput }
}
