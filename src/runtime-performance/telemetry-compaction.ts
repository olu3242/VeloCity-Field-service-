import { isRuntimePaused } from "@/lib/governance/operator"

export interface CompactionResult {
  compactionId: string
  subsystem: string
  tenantId?: string
  metricsBeforeCompaction: number
  metricsAfterCompaction: number
  retentionWindowMinutes: number
  compactionStrategy: "time_window" | "sampling" | "aggregation" | "deduplication"
  spaceRecoveredKb: number
  compactedAt: string
}

const RESULTS: CompactionResult[] = []
const CAP = 500

function computeAfter(
  strategy: CompactionResult["compactionStrategy"],
  metricCount: number,
  retentionMinutes: number,
): number {
  let after: number
  switch (strategy) {
    case "time_window":   after = Math.ceil(metricCount * retentionMinutes / 60); break
    case "sampling":      after = Math.ceil(metricCount * 0.1); break
    case "aggregation":   after = Math.ceil(metricCount * 0.05); break
    case "deduplication": after = Math.ceil(metricCount * 0.8); break
  }
  return Math.max(1, after)
}

export function compactTelemetry(
  subsystem: string,
  metricCount: number,
  retentionMinutes: number,
  strategy: CompactionResult["compactionStrategy"],
  tenantId?: string,
): CompactionResult {
  if (isRuntimePaused()) {
    throw new Error("Runtime is paused — telemetry compaction blocked")
  }
  const after = computeAfter(strategy, metricCount, retentionMinutes)
  const spaceRecoveredKb = (metricCount - after) * 0.1
  const result: CompactionResult = {
    compactionId: crypto.randomUUID(),
    subsystem,
    tenantId,
    metricsBeforeCompaction: metricCount,
    metricsAfterCompaction: after,
    retentionWindowMinutes: retentionMinutes,
    compactionStrategy: strategy,
    spaceRecoveredKb,
    compactedAt: new Date().toISOString(),
  }
  if (RESULTS.length >= CAP) RESULTS.shift()
  RESULTS.push(result)
  return result
}

export function getCompactionRecord(
  subsystem: string,
): CompactionResult | undefined {
  return RESULTS.find((r) => r.subsystem === subsystem)
}

export function getCompactionSummary(): {
  total: number
  avgReductionPct: number
  totalSpaceRecoveredKb: number
  byStrategy: Record<string, number>
} {
  const byStrategy: Record<string, number> = {}
  let totalReduction = 0
  let totalSpace = 0
  for (const r of RESULTS) {
    byStrategy[r.compactionStrategy] = (byStrategy[r.compactionStrategy] ?? 0) + 1
    const pct =
      (1 - r.metricsAfterCompaction / Math.max(1, r.metricsBeforeCompaction)) * 100
    totalReduction += pct
    totalSpace += r.spaceRecoveredKb
  }
  const total = RESULTS.length
  return {
    total,
    avgReductionPct: total > 0 ? totalReduction / total : 0,
    totalSpaceRecoveredKb: totalSpace,
    byStrategy,
  }
}
