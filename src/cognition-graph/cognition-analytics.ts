import { logger } from "@/runtime-core/observability"

export interface CognitionAnalyticsReport {
  reportId: string
  tenantId?: string
  totalAnomaliesReasoned: number
  totalRemediationsSynthesized: number
  avgAnomalyImpact: number
  avgRemediationConfidence: number
  topPatterns: string[]
  strongRelationships: number
  lineageDepthAvg: number
  fusionConfidenceAvg: number
  capturedAt: string
}

const REPORTS: CognitionAnalyticsReport[] = []
const REPORTS_CAP = 100

const DEFAULTS: Omit<CognitionAnalyticsReport, "reportId" | "capturedAt" | "tenantId"> = {
  totalAnomaliesReasoned: 0,
  totalRemediationsSynthesized: 0,
  avgAnomalyImpact: 0,
  avgRemediationConfidence: 0.8,
  topPatterns: [],
  strongRelationships: 0,
  lineageDepthAvg: 0,
  fusionConfidenceAvg: 0.8,
}

export function generateReport(tenantId?: string): CognitionAnalyticsReport {
  logger.info("Generating cognition analytics report")
  const report: CognitionAnalyticsReport = {
    reportId: crypto.randomUUID(),
    tenantId,
    ...DEFAULTS,
    capturedAt: new Date().toISOString(),
  }
  REPORTS.push(report)
  if (REPORTS.length > REPORTS_CAP) REPORTS.splice(0, REPORTS.length - REPORTS_CAP)
  return report
}

export function generateReportWithData(
  tenantId?: string,
  data: Partial<Omit<CognitionAnalyticsReport, "reportId" | "capturedAt" | "tenantId">> = {}
): CognitionAnalyticsReport {
  logger.info("Generating cognition analytics report with data")
  const report: CognitionAnalyticsReport = {
    reportId: crypto.randomUUID(),
    tenantId,
    ...DEFAULTS,
    ...data,
    capturedAt: new Date().toISOString(),
  }
  REPORTS.push(report)
  if (REPORTS.length > REPORTS_CAP) REPORTS.splice(0, REPORTS.length - REPORTS_CAP)
  return report
}

export function getLatestReport(tenantId?: string): CognitionAnalyticsReport | undefined {
  if (tenantId !== undefined) {
    const filtered = REPORTS.filter((r) => r.tenantId === tenantId)
    return filtered[filtered.length - 1]
  }
  return REPORTS[REPORTS.length - 1]
}

export function getReportTrend(limit = 10): CognitionAnalyticsReport[] {
  return REPORTS.slice(-limit)
}
