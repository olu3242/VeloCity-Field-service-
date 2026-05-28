import { logger } from "@/runtime-core/observability"

export interface StressTestResult {
  testId: string
  targetSubsystem: string
  tenantId?: string
  loadMultiplier: number
  predictedBreakingPointMultiplier: number
  bottlenecks: string[]
  predictedDegradationPct: number
  safeLoadMultiplier: number
  runId?: string
  testedAt: string
}

const RESULTS: StressTestResult[] = []
const RESULTS_CAP = 300

export function runStressTest(
  targetSubsystem: string,
  loadMultiplier: number,
  tenantId?: string,
  runId?: string,
): StressTestResult {
  if (RESULTS.length >= RESULTS_CAP) RESULTS.shift()

  const predictedBreakingPointMultiplier = loadMultiplier * 1.5 + Math.random() * 0.5
  const predictedDegradationPct = Math.min(100, (loadMultiplier - 1) * 30)
  const safeLoadMultiplier = predictedBreakingPointMultiplier * 0.6

  let bottlenecks: string[]
  if (loadMultiplier > 2) {
    bottlenecks = ["cpu", "memory"]
  } else if (loadMultiplier > 1.5) {
    bottlenecks = ["queue_depth"]
  } else {
    bottlenecks = []
  }

  const result: StressTestResult = {
    testId: crypto.randomUUID(),
    targetSubsystem,
    tenantId,
    loadMultiplier,
    predictedBreakingPointMultiplier,
    bottlenecks,
    predictedDegradationPct,
    safeLoadMultiplier,
    runId,
    testedAt: new Date().toISOString(),
  }
  RESULTS.push(result)
  logger.info("Stress test run", "stress-engine", {
    metadata: { testId: result.testId, targetSubsystem, loadMultiplier, predictedBreakingPointMultiplier },
  })
  return result
}

export function getBreakingPoint(targetSubsystem: string): number | undefined {
  const matching = RESULTS.filter((r) => r.targetSubsystem === targetSubsystem)
  if (matching.length === 0) return undefined
  return matching[matching.length - 1]?.predictedBreakingPointMultiplier
}

export function getStressSummary(): {
  total: number
  avgBreakingPoint: number
  mostStressedSystems: string[]
} {
  const total = RESULTS.length
  const avgBreakingPoint = total
    ? RESULTS.reduce((s, r) => s + r.predictedBreakingPointMultiplier, 0) / total
    : 0
  const countBySystem: Record<string, number> = {}
  for (const r of RESULTS) {
    countBySystem[r.targetSubsystem] = (countBySystem[r.targetSubsystem] ?? 0) + 1
  }
  const sorted = Object.entries(countBySystem).sort((a, b) => b[1] - a[1])
  const mostStressedSystems = sorted.slice(0, 5).map(([name]) => name)
  return { total, avgBreakingPoint, mostStressedSystems }
}
