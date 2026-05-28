import { clampScore } from "@/runtime-core/scoring"

export interface CorrectnessReport {
  reportId: string
  executionId: string
  tenantId?: string
  deterministicScore: number
  orchestrationCompliance: number
  autonomySafety: number
  dagValidity: boolean
  consistencyScore: number
  overallScore: number
  passed: boolean
  generatedAt: string
}

const REPORTS: CorrectnessReport[] = []
const REPORTS_CAP = 500

export function generateCorrectnessReport(
  executionId: string,
  scores: {
    deterministicScore?: number
    orchestrationCompliance?: number
    autonomySafety?: number
    dagValidity?: boolean
    consistencyScore?: number
  },
  tenantId?: string
): CorrectnessReport {
  if (REPORTS.length >= REPORTS_CAP) REPORTS.shift()

  const numericScores: number[] = []
  if (scores.deterministicScore !== undefined) numericScores.push(scores.deterministicScore)
  if (scores.orchestrationCompliance !== undefined) numericScores.push(scores.orchestrationCompliance)
  if (scores.autonomySafety !== undefined) numericScores.push(scores.autonomySafety)
  if (scores.dagValidity !== undefined) numericScores.push(scores.dagValidity ? 100 : 0)
  if (scores.consistencyScore !== undefined) numericScores.push(scores.consistencyScore)

  const rawAvg =
    numericScores.length === 0
      ? 0
      : numericScores.reduce((sum, s) => sum + s, 0) / numericScores.length
  const overallScore = clampScore(rawAvg)
  const passed = overallScore >= 80

  const report: CorrectnessReport = {
    reportId: crypto.randomUUID(),
    executionId,
    tenantId,
    deterministicScore: scores.deterministicScore ?? 0,
    orchestrationCompliance: scores.orchestrationCompliance ?? 0,
    autonomySafety: scores.autonomySafety ?? 0,
    dagValidity: scores.dagValidity ?? false,
    consistencyScore: scores.consistencyScore ?? 0,
    overallScore,
    passed,
    generatedAt: new Date().toISOString(),
  }

  REPORTS.push(report)
  return report
}

export function getReport(executionId: string): CorrectnessReport | undefined {
  return REPORTS.find((r) => r.executionId === executionId)
}

export function getFailingReports(): CorrectnessReport[] {
  return REPORTS.filter((r) => !r.passed)
}

export function getCorrectnessSummary(): {
  total: number
  passed: number
  failed: number
  avgScore: number
} {
  const passed = REPORTS.filter((r) => r.passed).length
  const avgScore =
    REPORTS.length === 0
      ? 0
      : REPORTS.reduce((sum, r) => sum + r.overallScore, 0) / REPORTS.length
  return { total: REPORTS.length, passed, failed: REPORTS.length - passed, avgScore }
}
