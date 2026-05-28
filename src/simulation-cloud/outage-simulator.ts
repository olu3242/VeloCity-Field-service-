import { logger } from "@/runtime-core/observability"

export interface OutageScenario {
  scenarioId: string
  tenantId?: string
  affectedSubsystems: string[]
  outageType: "partial" | "full" | "degraded" | "cascading"
  durationMinutes: number
  blastRadiusPct: number
  cascadeDepth: number
  recoveryTimeMinutes: number
  financialImpactEstimate: number
  simulatedAt: string
  runId?: string
}

const SCENARIOS: OutageScenario[] = []
const SCENARIOS_CAP = 300

export function simulateOutage(
  affectedSubsystems: string[],
  outageType: OutageScenario["outageType"],
  durationMinutes: number,
  tenantId?: string,
  runId?: string,
): OutageScenario {
  if (SCENARIOS.length >= SCENARIOS_CAP) SCENARIOS.shift()

  const isCascading = outageType === "cascading"
  const cascadeDepth = affectedSubsystems.length * (isCascading ? 3 : 1)
  const blastRadiusPct = Math.min(95, affectedSubsystems.length * 15 + (isCascading ? 20 : 0))
  const recoveryTimeMinutes = durationMinutes * 0.3 + cascadeDepth * 5
  const financialImpactEstimate = blastRadiusPct * 100

  const scenario: OutageScenario = {
    scenarioId: crypto.randomUUID(),
    tenantId,
    affectedSubsystems,
    outageType,
    durationMinutes,
    blastRadiusPct,
    cascadeDepth,
    recoveryTimeMinutes,
    financialImpactEstimate,
    simulatedAt: new Date().toISOString(),
    runId,
  }
  SCENARIOS.push(scenario)
  logger.info("Outage simulated", "outage-simulator", {
    metadata: { scenarioId: scenario.scenarioId, outageType, blastRadiusPct },
  })
  return scenario
}

export function getWorstCaseScenario(): OutageScenario | undefined {
  if (SCENARIOS.length === 0) return undefined
  return SCENARIOS.reduce((worst, s) => (s.blastRadiusPct > worst.blastRadiusPct ? s : worst))
}

export function getOutageSummary(): {
  total: number
  byType: Record<string, number>
  avgBlastRadius: number
  avgRecoveryMins: number
} {
  const byType: Record<string, number> = {}
  let blastSum = 0
  let recoverySum = 0
  for (const s of SCENARIOS) {
    byType[s.outageType] = (byType[s.outageType] ?? 0) + 1
    blastSum += s.blastRadiusPct
    recoverySum += s.recoveryTimeMinutes
  }
  const total = SCENARIOS.length
  return {
    total,
    byType,
    avgBlastRadius: total ? blastSum / total : 0,
    avgRecoveryMins: total ? recoverySum / total : 0,
  }
}
