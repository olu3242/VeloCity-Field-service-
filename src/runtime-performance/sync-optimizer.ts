import { clampScore } from "@/runtime-core/scoring"

export interface SyncOptimization {
  optimizationId: string
  syncTarget: string
  tenantId?: string
  strategy: "batching" | "delta_sync" | "lazy_sync" | "priority_queue" | "compression"
  baselineLatencyMs: number
  optimizedLatencyMs: number
  improvementPct: number
  appliedAt: string
}

const OPTIMIZATIONS: SyncOptimization[] = []
const CAP = 500

function computeOptimizedMs(
  strategy: SyncOptimization["strategy"],
  baseline: number,
): number {
  switch (strategy) {
    case "batching":        return baseline * 0.6
    case "delta_sync":      return baseline * 0.4
    case "lazy_sync":       return baseline * 0.5
    case "priority_queue":  return baseline * 0.7
    case "compression":     return baseline * 0.55
  }
}

export function optimizeSync(
  syncTarget: string,
  strategy: SyncOptimization["strategy"],
  baselineMs: number,
  tenantId?: string,
): SyncOptimization {
  const optimizedLatencyMs = computeOptimizedMs(strategy, baselineMs)
  const improvementPct = clampScore(
    (1 - optimizedLatencyMs / Math.max(1, baselineMs)) * 100,
  )
  const opt: SyncOptimization = {
    optimizationId: crypto.randomUUID(),
    syncTarget,
    tenantId,
    strategy,
    baselineLatencyMs: baselineMs,
    optimizedLatencyMs,
    improvementPct,
    appliedAt: new Date().toISOString(),
  }
  if (OPTIMIZATIONS.length >= CAP) OPTIMIZATIONS.shift()
  OPTIMIZATIONS.push(opt)
  return opt
}

export function getOptimization(
  syncTarget: string,
): SyncOptimization | undefined {
  return OPTIMIZATIONS.find((o) => o.syncTarget === syncTarget)
}

export function getTopOptimizations(limit = 10): SyncOptimization[] {
  return Array.from(OPTIMIZATIONS)
    .sort((a, b) => b.improvementPct - a.improvementPct)
    .slice(0, limit)
}

export function getSyncSummary(): {
  total: number
  avgImprovementPct: number
  byStrategy: Record<string, number>
} {
  const byStrategy: Record<string, number> = {}
  let totalImprovement = 0
  for (const o of OPTIMIZATIONS) {
    byStrategy[o.strategy] = (byStrategy[o.strategy] ?? 0) + 1
    totalImprovement += o.improvementPct
  }
  const total = OPTIMIZATIONS.length
  return {
    total,
    avgImprovementPct: total > 0 ? totalImprovement / total : 0,
    byStrategy,
  }
}
