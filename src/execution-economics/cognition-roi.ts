import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface CognitionROI {
  roiId: string
  cognitionId: string
  domain: string
  tenantId?: string
  decisionsMade: number
  decisionsCorrect: number
  accuracyRate: number
  estimatedValueUsd: number
  estimatedCostUsd: number
  roiMultiplier: number
  roiLevel: "negative" | "breakeven" | "positive" | "high_value"
  calculatedAt: string
}

const ROI_RECORDS: CognitionROI[] = []
const ROLLING_CAP = 500

function resolveRoiLevel(
  multiplier: number
): CognitionROI["roiLevel"] {
  if (multiplier < 0.5) return "negative"
  if (multiplier < 1.0) return "breakeven"
  if (multiplier < 3.0) return "positive"
  return "high_value"
}

export function calculateROI(
  cognitionId: string,
  domain: string,
  decisionsMade: number,
  decisionsCorrect: number,
  costUsd: number,
  valuePerCorrectDecision: number,
  tenantId?: string
): CognitionROI {
  if (isRuntimePaused()) {
    logger.warn("calculateROI blocked: runtime paused", { cognitionId })
  }
  const accuracyRate = decisionsCorrect / Math.max(1, decisionsMade)
  const estimatedValueUsd = decisionsCorrect * valuePerCorrectDecision
  const estimatedCostUsd = costUsd
  const roiMultiplier =
    estimatedCostUsd > 0 ? estimatedValueUsd / estimatedCostUsd : 0
  const roiLevel = resolveRoiLevel(roiMultiplier)
  const record: CognitionROI = {
    roiId: crypto.randomUUID(),
    cognitionId,
    domain,
    tenantId,
    decisionsMade,
    decisionsCorrect,
    accuracyRate,
    estimatedValueUsd,
    estimatedCostUsd,
    roiMultiplier,
    roiLevel,
    calculatedAt: new Date().toISOString(),
  }
  ROI_RECORDS.push(record)
  if (ROI_RECORDS.length > ROLLING_CAP) ROI_RECORDS.shift()
  return record
}

export function getROI(cognitionId: string): CognitionROI | undefined {
  return ROI_RECORDS.find((r) => r.cognitionId === cognitionId)
}

export function getHighValueCognitions(): CognitionROI[] {
  return ROI_RECORDS.filter((r) => r.roiLevel === "high_value")
}

export function getROISummary(): {
  total: number
  avgROI: number
  highValue: number
  negative: number
  totalValueUsd: number
} {
  const total = ROI_RECORDS.length
  const avgROI =
    total > 0
      ? ROI_RECORDS.reduce((s, r) => s + r.roiMultiplier, 0) / total
      : 0
  const highValue = ROI_RECORDS.filter((r) => r.roiLevel === "high_value").length
  const negative = ROI_RECORDS.filter((r) => r.roiLevel === "negative").length
  const totalValueUsd = ROI_RECORDS.reduce((s, r) => s + r.estimatedValueUsd, 0)
  return { total, avgROI, highValue, negative, totalValueUsd }
}
