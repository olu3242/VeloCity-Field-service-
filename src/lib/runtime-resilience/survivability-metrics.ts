/**
 * Survivability Metrics — computes overall system survivability scores.
 * In-memory singleton with rolling cap of 50 entries.
 */

import { getAllCircuits } from "@/lib/governance/circuit-breaker"
import { getResilienceReport } from "@/lib/simulation/resilience-tester"
import { getActiveDrifts, getDriftSummary } from "@/lib/runtime-state/drift-analyzer"
import { getRecoveryStats } from "./recovery-orchestrator"

const HISTORY_CAP = 50

export interface SurvivabilityReport {
  id: string
  overallScore: number
  components: {
    circuitHealth: number
    recoverySuccess: number
    resilienceScore: number
    driftScore: number
  }
  level: "resilient" | "stable" | "fragile" | "critical"
  generatedAt: string
}

const HISTORY: SurvivabilityReport[] = []

function enforceCap(): void {
  while (HISTORY.length > HISTORY_CAP) HISTORY.shift()
}

function deriveLevel(score: number): SurvivabilityReport["level"] {
  if (score >= 85) return "resilient"
  if (score >= 65) return "stable"
  if (score >= 40) return "fragile"
  return "critical"
}

export function computeSurvivability(): SurvivabilityReport {
  const circuits = getAllCircuits()
  const totalCircuits = Math.max(1, circuits.length)
  const openCount = circuits.filter((c) => c.state === "open").length
  const circuitHealth = (1 - openCount / totalCircuits) * 100

  const recoveryStats = getRecoveryStats()
  const recoverySuccess = recoveryStats.successRate * 100

  const resilience = getResilienceReport()
  const resTotal = resilience.passed + resilience.failed
  const resilienceScore = resTotal > 0 ? (resilience.passed / resTotal) * 100 : 100

  const driftSummary = getDriftSummary()
  const totalDrifts = Math.max(1, driftSummary.total)
  const activeDrifts = getActiveDrifts().length
  const driftScore = (1 - activeDrifts / totalDrifts) * 100

  const overallScore = (circuitHealth + recoverySuccess + resilienceScore + driftScore) / 4

  const report: SurvivabilityReport = {
    id: crypto.randomUUID(),
    overallScore,
    components: { circuitHealth, recoverySuccess, resilienceScore, driftScore },
    level: deriveLevel(overallScore),
    generatedAt: new Date().toISOString(),
  }
  return report
}

export function recordSurvivabilitySnapshot(): SurvivabilityReport {
  const report = computeSurvivability()
  HISTORY.push(report)
  enforceCap()
  return report
}

export function getSurvivabilityTrend(): "improving" | "stable" | "degrading" {
  if (HISTORY.length < 6) return "stable"
  const recent = HISTORY.slice(-3)
  const prior = HISTORY.slice(-6, -3)
  const avgRecent = recent.reduce((s, r) => s + r.overallScore, 0) / 3
  const avgPrior = prior.reduce((s, r) => s + r.overallScore, 0) / 3
  if (avgRecent > avgPrior + 2) return "improving"
  if (avgRecent < avgPrior - 2) return "degrading"
  return "stable"
}
