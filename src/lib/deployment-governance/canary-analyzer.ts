/**
 * Canary Analyzer — evaluates canary deployment health.
 * In-memory singleton with rolling cap of 100 entries.
 */

const ANALYSES_CAP = 100

export interface CanaryAnalysis {
  deploymentId: string
  errorRate: number
  latencyP99Ms: number
  trafficPct: number
  passed: boolean
  recommendation: "promote" | "hold" | "rollback"
  analyzedAt: string
}

const ANALYSES: CanaryAnalysis[] = []

function enforceCap(): void {
  while (ANALYSES.length > ANALYSES_CAP) ANALYSES.shift()
}

function deriveRecommendation(
  passed: boolean,
  errorRate: number,
  trafficPct: number
): CanaryAnalysis["recommendation"] {
  if (errorRate > 0.1) return "rollback"
  if (passed && trafficPct >= 10) return "promote"
  return "hold"
}

export function analyzeCanary(
  deploymentId: string,
  errorRate: number,
  latencyP99Ms: number,
  trafficPct: number
): CanaryAnalysis {
  const passed = errorRate < 0.05 && latencyP99Ms < 2000
  const recommendation = deriveRecommendation(passed, errorRate, trafficPct)
  const analysis: CanaryAnalysis = {
    deploymentId,
    errorRate,
    latencyP99Ms,
    trafficPct,
    passed,
    recommendation,
    analyzedAt: new Date().toISOString(),
  }
  ANALYSES.push(analysis)
  enforceCap()
  return analysis
}

export function getLatestCanary(deploymentId: string): CanaryAnalysis | undefined {
  const matches = ANALYSES.filter((a) => a.deploymentId === deploymentId)
  return matches[matches.length - 1]
}

export function getFailedCanaries(): CanaryAnalysis[] {
  return ANALYSES.filter((a) => !a.passed)
}
