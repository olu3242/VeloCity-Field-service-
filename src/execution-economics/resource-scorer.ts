import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface OrchestrationResourceScore {
  scoreId: string
  orchestrationId: string
  tenantId?: string
  computeEfficiency: number
  memoryEfficiency: number
  timeEfficiency: number
  overallResourceScore: number
  resourceWaste: number
  recommendation:
    | "none"
    | "optimize_compute"
    | "optimize_memory"
    | "optimize_time"
    | "scale_down"
  scoredAt: string
}

const SCORES: OrchestrationResourceScore[] = []
const ROLLING_CAP = 500

type RecommendationKey = "compute" | "memory" | "time"

function resolveRecommendation(
  computeEff: number,
  memoryEff: number,
  timeEff: number,
  resourceWaste: number
): OrchestrationResourceScore["recommendation"] {
  if (resourceWaste < 10) return "none"
  const dims: Record<RecommendationKey, number> = {
    compute: computeEff,
    memory: memoryEff,
    time: timeEff,
  }
  let lowestKey: RecommendationKey = "compute"
  let lowestVal = computeEff
  for (const key of Array.from(Object.keys(dims)) as RecommendationKey[]) {
    if (dims[key] < lowestVal) {
      lowestVal = dims[key]
      lowestKey = key
    }
  }
  if (lowestVal >= 50) return "scale_down"
  return `optimize_${lowestKey}` as OrchestrationResourceScore["recommendation"]
}

export function scoreResources(
  orchestrationId: string,
  computePct: number,
  memoryPct: number,
  durationMs: number,
  expectedDurationMs: number,
  tenantId?: string
): OrchestrationResourceScore {
  if (isRuntimePaused()) {
    logger.warn("scoreResources blocked: runtime paused", { orchestrationId })
  }
  const computeEfficiency = clampScore(100 - computePct)
  const memoryEfficiency = clampScore(100 - memoryPct)
  const timeEfficiency = clampScore(
    100 - (durationMs / Math.max(1, expectedDurationMs)) * 50
  )
  const overallResourceScore = clampScore(
    (computeEfficiency + memoryEfficiency + timeEfficiency) / 3
  )
  const resourceWaste = 100 - overallResourceScore
  const recommendation = resolveRecommendation(
    computeEfficiency,
    memoryEfficiency,
    timeEfficiency,
    resourceWaste
  )
  const record: OrchestrationResourceScore = {
    scoreId: crypto.randomUUID(),
    orchestrationId,
    tenantId,
    computeEfficiency,
    memoryEfficiency,
    timeEfficiency,
    overallResourceScore,
    resourceWaste,
    recommendation,
    scoredAt: new Date().toISOString(),
  }
  SCORES.push(record)
  if (SCORES.length > ROLLING_CAP) SCORES.shift()
  return record
}

export function getResourceScore(
  orchestrationId: string
): OrchestrationResourceScore | undefined {
  return SCORES.find((s) => s.orchestrationId === orchestrationId)
}

export function getWasteLeaders(): OrchestrationResourceScore[] {
  return SCORES.filter((s) => s.resourceWaste >= 50)
    .sort((a, b) => b.resourceWaste - a.resourceWaste)
    .slice(0, 10)
}

export function getResourceSummary(): {
  total: number
  avgScore: number
  avgWaste: number
  byRecommendation: Record<string, number>
} {
  const total = SCORES.length
  const avgScore =
    total > 0 ? SCORES.reduce((s, r) => s + r.overallResourceScore, 0) / total : 0
  const avgWaste =
    total > 0 ? SCORES.reduce((s, r) => s + r.resourceWaste, 0) / total : 0
  const byRecommendation: Record<string, number> = {}
  for (const s of SCORES) {
    byRecommendation[s.recommendation] =
      (byRecommendation[s.recommendation] ?? 0) + 1
  }
  return { total, avgScore, avgWaste, byRecommendation }
}
