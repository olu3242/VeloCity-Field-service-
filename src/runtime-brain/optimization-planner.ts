import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { recordRecommendation } from "./runtime-brain"

export interface OptimizationRecommendation {
  recommendationId: string
  target: string
  tenantId?: string
  optimizationType: string
  currentEstimate: number
  recommendedValue: number
  expectedImprovementPct: number
  confidence: number
  basis: string
  status: "pending" | "applied" | "rejected" | "expired"
  createdAt: string
  appliedAt?: string
}

const RECOMMENDATIONS: OptimizationRecommendation[] = []
const CAP = 500

export function generateRecommendation(
  target: string,
  optimizationType: string,
  current: number,
  recommended: number,
  basisReason: string,
  tenantId?: string,
): OptimizationRecommendation {
  if (isRuntimePaused()) {
    logger.warn("generateRecommendation blocked: runtime paused", "optimization-planner")
  }
  const diff = recommended - current
  const expectedImprovementPct = current !== 0 ? Math.abs(diff / current) * 100 : 0
  const confidence = Math.min(0.95, 0.6 + expectedImprovementPct / 200)
  const rec: OptimizationRecommendation = {
    recommendationId: crypto.randomUUID(),
    target,
    tenantId,
    optimizationType,
    currentEstimate: current,
    recommendedValue: recommended,
    expectedImprovementPct: Math.round(expectedImprovementPct * 10) / 10,
    confidence,
    basis: basisReason,
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  if (RECOMMENDATIONS.length >= CAP) RECOMMENDATIONS.shift()
  RECOMMENDATIONS.push(rec)
  recordRecommendation()
  logger.info(`Optimization recommendation generated: ${optimizationType} for ${target}`, "optimization-planner", { tenantId })
  return rec
}

export function applyRecommendation(recommendationId: string): void {
  if (isRuntimePaused()) {
    logger.warn("applyRecommendation blocked: runtime paused", "optimization-planner")
    return
  }
  const rec = RECOMMENDATIONS.find((r) => r.recommendationId === recommendationId)
  if (rec) {
    rec.status = "applied"
    rec.appliedAt = new Date().toISOString()
  }
}

export function rejectRecommendation(recommendationId: string): void {
  const rec = RECOMMENDATIONS.find((r) => r.recommendationId === recommendationId)
  if (rec) rec.status = "rejected"
}

export function getPendingRecommendations(target?: string): OptimizationRecommendation[] {
  return RECOMMENDATIONS.filter(
    (r) => r.status === "pending" && (target === undefined || r.target === target),
  )
}

export function getOptimizationStats(): {
  total: number; pending: number; applied: number; rejected: number; avgExpectedImprovement: number
} {
  let pending = 0, applied = 0, rejected = 0, totalImprov = 0
  for (const r of RECOMMENDATIONS) {
    if (r.status === "pending") pending++
    else if (r.status === "applied") applied++
    else if (r.status === "rejected") rejected++
    totalImprov += r.expectedImprovementPct
  }
  return {
    total: RECOMMENDATIONS.length, pending, applied, rejected,
    avgExpectedImprovement: RECOMMENDATIONS.length > 0 ? totalImprov / RECOMMENDATIONS.length : 0,
  }
}
