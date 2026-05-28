import { logger } from "@/runtime-core/observability"
import { clampScore } from "@/runtime-core/scoring"
import type { DeploymentStrategy } from "./deployment-plan"

export interface BlastRadiusReport {
  reportId: string
  planId: string
  tenantId?: string
  estimatedAffectedWorkflows: number
  estimatedAffectedTenants: number
  dependentSubsystems: string[]
  riskFactors: { factor: string; severity: "low" | "medium" | "high" | "critical" }[]
  overallScore: number
  recommendation: "proceed" | "proceed_with_caution" | "delay" | "abort"
  analyzedAt: string
}

const REPORTS: BlastRadiusReport[] = []
const REPORTS_CAP = 200

const SUBSYSTEMS_BY_STRATEGY: Record<DeploymentStrategy, string[]> = {
  rolling: ["workflow-engine", "queue-processor", "telemetry", "auth"],
  canary: ["workflow-engine", "telemetry"],
  blue_green: ["workflow-engine", "queue-processor", "federation", "auth"],
  shadow: ["telemetry"],
  feature_flag: ["feature-registry"],
}

function baseScore(strategy: DeploymentStrategy): number {
  switch (strategy) {
    case "shadow": return 15
    case "canary": return 25
    case "feature_flag": return 30
    case "rolling": return 50
    case "blue_green": return 60
  }
}

function recommendation(score: number): BlastRadiusReport["recommendation"] {
  if (score <= 30) return "proceed"
  if (score <= 55) return "proceed_with_caution"
  if (score <= 75) return "delay"
  return "abort"
}

export function analyzeBlastRadius(
  planId: string,
  strategy: DeploymentStrategy,
  targetVersion: string,
  tenantId?: string
): BlastRadiusReport {
  if (REPORTS.length >= REPORTS_CAP) REPORTS.shift()

  const subsystems = SUBSYSTEMS_BY_STRATEGY[strategy]
  const subsystemPenalty = subsystems.length * 3
  const raw = baseScore(strategy) + subsystemPenalty
  const overallScore = clampScore(raw)

  const riskFactors: BlastRadiusReport["riskFactors"] = [
    { factor: `Strategy: ${strategy}`, severity: overallScore > 60 ? "high" : overallScore > 40 ? "medium" : "low" },
    { factor: `Target version: ${targetVersion}`, severity: "low" },
    { factor: `Dependent subsystems: ${subsystems.length}`, severity: subsystems.length > 3 ? "medium" : "low" },
  ]

  if (overallScore > 70) {
    riskFactors.push({ factor: "High blast radius detected", severity: "critical" })
  }

  const report: BlastRadiusReport = {
    reportId: crypto.randomUUID(),
    planId,
    tenantId,
    estimatedAffectedWorkflows: Math.round(subsystems.length * 12),
    estimatedAffectedTenants: tenantId ? 1 : subsystems.length * 5,
    dependentSubsystems: subsystems,
    riskFactors,
    overallScore,
    recommendation: recommendation(overallScore),
    analyzedAt: new Date().toISOString(),
  }

  REPORTS.push(report)
  logger.info(`Blast radius analyzed for plan ${planId}`, "blast-radius-analyzer", {
    metadata: { overallScore, recommendation: report.recommendation },
  })
  return report
}

export function getLatestReport(planId: string): BlastRadiusReport | undefined {
  return [...REPORTS].reverse().find((r) => r.planId === planId)
}

export function getHighRiskDeployments(): BlastRadiusReport[] {
  return REPORTS.filter((r) => r.overallScore > 60)
}

export function getAnalysisSummary(): {
  total: number
  avgScore: number
  byRecommendation: Record<string, number>
} {
  const total = REPORTS.length
  const avgScore = total > 0 ? Math.round(REPORTS.reduce((sum, r) => sum + r.overallScore, 0) / total) : 0
  const byRecommendation: Record<string, number> = {}
  for (const r of REPORTS) {
    byRecommendation[r.recommendation] = (byRecommendation[r.recommendation] ?? 0) + 1
  }
  return { total, avgScore, byRecommendation }
}
