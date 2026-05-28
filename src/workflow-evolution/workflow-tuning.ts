import { logger } from "@/runtime-core/observability"

export interface TuningRecommendation {
  tuningId: string
  workflowType: string
  tenantId?: string
  parameterName: string
  currentValue: number
  recommendedValue: number
  expectedImprovementPct: number
  basis: string
  confidence: number
  status: "pending" | "applied" | "rejected"
  createdAt: string
}

const TUNING: TuningRecommendation[] = []
const TUNING_CAP = 500

export function recommendTuning(
  workflowType: string,
  param: string,
  current: number,
  recommended: number,
  basis: string,
  confidence: number,
  tenantId?: string,
): TuningRecommendation {
  if (TUNING.length >= TUNING_CAP) TUNING.shift()
  const rec: TuningRecommendation = {
    tuningId: crypto.randomUUID(),
    workflowType,
    tenantId,
    parameterName: param,
    currentValue: current,
    recommendedValue: recommended,
    expectedImprovementPct: current !== 0 ? Math.abs((recommended - current) / current) * 100 : 0,
    basis,
    confidence: Math.max(0, Math.min(1, confidence)),
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  TUNING.push(rec)
  logger.info(`Tuning recommended: ${param} for ${workflowType}`, "workflow-tuning", {
    metadata: { current, recommended, expectedImprovementPct: rec.expectedImprovementPct },
  })
  return rec
}

export function applyTuning(tuningId: string): void {
  const rec = TUNING.find(r => r.tuningId === tuningId)
  if (rec) rec.status = "applied"
}

export function rejectTuning(tuningId: string): void {
  const rec = TUNING.find(r => r.tuningId === tuningId)
  if (rec) rec.status = "rejected"
}

export function getPendingTuning(workflowType?: string): TuningRecommendation[] {
  return TUNING.filter(r => r.status === "pending" && (!workflowType || r.workflowType === workflowType))
}

export function getTuningSummary(): { total: number; pending: number; applied: number; rejected: number; avgExpectedImprovement: number } {
  const total = TUNING.length
  const pending = TUNING.filter(r => r.status === "pending").length
  const applied = TUNING.filter(r => r.status === "applied").length
  const rejected = TUNING.filter(r => r.status === "rejected").length
  const avgExpectedImprovement = total > 0 ? TUNING.reduce((s, r) => s + r.expectedImprovementPct, 0) / total : 0
  return { total, pending, applied, rejected, avgExpectedImprovement }
}
