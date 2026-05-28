import { getOperatorState, isRuntimePaused } from "@/lib/governance/operator"
import { getAllCircuits } from "@/lib/governance/circuit-breaker"
import { calculateEffectiveness } from "@/lib/economy/telemetry"
import { scoreOperationalReadiness } from "@/lib/maturity/readiness-scorer"
import { getResilienceReport } from "@/lib/simulation/resilience-tester"

export interface PlatformHealthReport {
  overallScore: number        // 0-100
  level: "healthy" | "degraded" | "critical" | "emergency"
  components: {
    governanceScore: number
    circuitScore: number
    resilienceScore: number
    effectivenessScore: number
    readinessScore: number
  }
  openCircuits: number
  runtimePaused: boolean
  generatedAt: string
}

const HISTORY: PlatformHealthReport[] = []
const MAX_HISTORY = 100

export function aggregatePlatformHealth(): PlatformHealthReport {
  const opState = getOperatorState()
  const governanceScore = opState !== undefined ? 100 : 0

  const circuits = getAllCircuits()
  const openCircuits = circuits.filter((c) => c.state === "open").length
  const circuitScore = circuits.length > 0
    ? Math.round((1 - openCircuits / circuits.length) * 100)
    : 100

  const resilience = getResilienceReport()
  const total = resilience.passed + resilience.failed
  const resilienceScore = total > 0 ? Math.round((resilience.passed / total) * 100) : 100

  const effectivenessScore = Math.round(calculateEffectiveness().composite)
  const readinessScore = Math.round(scoreOperationalReadiness().composite)

  const overallScore = Math.round(
    (governanceScore * 0.25 +
      circuitScore * 0.20 +
      resilienceScore * 0.20 +
      effectivenessScore * 0.20 +
      readinessScore * 0.15)
  )

  const runtimePaused = isRuntimePaused()
  const level: PlatformHealthReport["level"] =
    runtimePaused ? "emergency"
    : overallScore >= 80 ? "healthy"
    : overallScore >= 60 ? "degraded"
    : "critical"

  const report: PlatformHealthReport = {
    overallScore,
    level,
    components: { governanceScore, circuitScore, resilienceScore, effectivenessScore, readinessScore },
    openCircuits,
    runtimePaused,
    generatedAt: new Date().toISOString(),
  }

  if (HISTORY.length >= MAX_HISTORY) HISTORY.shift()
  HISTORY.push(report)
  return report
}

export function getHealthHistory(limit = 10): PlatformHealthReport[] {
  return HISTORY.slice(-limit)
}

export function getHealthTrend(): "improving" | "stable" | "degrading" {
  if (HISTORY.length < 6) return "stable"
  const recent = HISTORY.slice(-3)
  const prior = HISTORY.slice(-6, -3)
  const avgRecent = recent.reduce((s, r) => s + r.overallScore, 0) / recent.length
  const avgPrior = prior.reduce((s, r) => s + r.overallScore, 0) / prior.length
  if (avgRecent > avgPrior + 3) return "improving"
  if (avgRecent < avgPrior - 3) return "degrading"
  return "stable"
}
