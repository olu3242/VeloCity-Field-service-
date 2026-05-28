import { isRuntimePaused } from "@/lib/governance/operator"
import { logger } from "@/runtime-core/observability"

export interface SharedOptimization {
  shareId: string
  optimizationType: string
  workflowCategory: string
  improvementPct: number
  sampleSize: number
  anonymous: boolean
  sharedAt: string
  sourceRegion?: string
  receivedByCount: number
  averageLocalImpact?: number
}

const SHARED: SharedOptimization[] = []
const MAX_SHARED = 500

export function shareOptimization(
  type: string,
  category: string,
  improvementPct: number,
  sampleSize: number,
  region?: string,
  anonymous = true,
): SharedOptimization {
  if (isRuntimePaused()) {
    logger.warn("shareOptimization blocked: runtime paused", "optimization-sharing")
    throw new Error("Runtime is paused")
  }

  const opt: SharedOptimization = {
    shareId: crypto.randomUUID(),
    optimizationType: type,
    workflowCategory: category,
    improvementPct,
    sampleSize,
    anonymous,
    sharedAt: new Date().toISOString(),
    sourceRegion: region,
    receivedByCount: 0,
  }

  if (SHARED.length >= MAX_SHARED) SHARED.shift()
  SHARED.push(opt)
  logger.info(`Optimization shared: ${type} (${category})`, "optimization-sharing", {
    metadata: { improvementPct, sampleSize },
  })
  return opt
}

export function recordReceipt(shareId: string): void {
  const opt = SHARED.find((s) => s.shareId === shareId)
  if (opt) opt.receivedByCount += 1
}

export function recordLocalImpact(shareId: string, impact: number): void {
  const opt = SHARED.find((s) => s.shareId === shareId)
  if (opt) {
    const prev = opt.averageLocalImpact
    opt.averageLocalImpact = prev === undefined ? impact : (prev + impact) / 2
  }
}

export function getTopOptimizations(category?: string): SharedOptimization[] {
  const filtered = category ? SHARED.filter((s) => s.workflowCategory === category) : [...SHARED]
  return filtered.sort((a, b) => b.improvementPct - a.improvementPct)
}

export function getSharingSummary(): { total: number; avgImprovement: number; avgReceivedBy: number } {
  const total = SHARED.length
  if (total === 0) return { total: 0, avgImprovement: 0, avgReceivedBy: 0 }
  const avgImprovement = SHARED.reduce((s, o) => s + o.improvementPct, 0) / total
  const avgReceivedBy = SHARED.reduce((s, o) => s + o.receivedByCount, 0) / total
  return { total, avgImprovement, avgReceivedBy }
}
