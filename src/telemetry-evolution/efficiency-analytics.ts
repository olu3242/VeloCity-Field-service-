import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"

export interface TelemetryEfficiencyReport {
  reportId: string
  tenantId?: string
  totalEvents: number
  batchedEvents: number
  compressedEvents: number
  archivedEvents: number
  batchingEfficiency: number
  compressionRatio: number
  archivalRate: number
  estimatedCostSavingPct: number
  capturedAt: string
}

const REPORTS: TelemetryEfficiencyReport[] = []
const MAX_REPORTS = 100

export function generateEfficiencyReport(
  data: {
    totalEvents: number
    batchedEvents: number
    compressedEvents: number
    archivedEvents: number
  },
  tenantId?: string
): TelemetryEfficiencyReport {
  while (REPORTS.length >= MAX_REPORTS) {
    REPORTS.shift()
  }

  const batchingEfficiency = clampScore((data.batchedEvents / Math.max(1, data.totalEvents)) * 100)
  const compressionRatio =
    data.totalEvents > 0 ? Math.max(1, data.totalEvents / Math.max(1, data.compressedEvents)) : 1
  const archivalRate = clampScore((data.archivedEvents / Math.max(1, data.totalEvents)) * 100)
  const estimatedCostSavingPct = clampScore(
    batchingEfficiency * 0.3 + archivalRate * 0.4 + Math.min(compressionRatio * 5, 30)
  )

  const report: TelemetryEfficiencyReport = {
    reportId: crypto.randomUUID(),
    tenantId,
    totalEvents: data.totalEvents,
    batchedEvents: data.batchedEvents,
    compressedEvents: data.compressedEvents,
    archivedEvents: data.archivedEvents,
    batchingEfficiency,
    compressionRatio,
    archivalRate,
    estimatedCostSavingPct,
    capturedAt: new Date().toISOString(),
  }

  REPORTS.push(report)
  logger.info("Efficiency report generated", { reportId: report.reportId, estimatedCostSavingPct })
  return report
}

export function getLatestReport(tenantId?: string): TelemetryEfficiencyReport | undefined {
  for (let i = REPORTS.length - 1; i >= 0; i--) {
    const r = REPORTS[i]
    if (r && (tenantId === undefined || r.tenantId === tenantId)) return r
  }
  return undefined
}

export function getReportTrend(limit = 10): TelemetryEfficiencyReport[] {
  return REPORTS.slice(-limit)
}
