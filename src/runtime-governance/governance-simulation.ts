import { logger } from "@/runtime-core/observability"

export interface GovernanceSimulation {
  simulationId: string
  simulationType: "policy_change" | "constitution_update" | "new_tenant" | "federation_join"
  inputScenario: Record<string, unknown>
  predictedViolations: number
  predictedBlockedWorkflows: number
  predictedImpactScore: number
  recommendation: "safe" | "caution" | "high_risk" | "abort"
  simulatedAt: string
  tenantId?: string
}

const SIMULATIONS: GovernanceSimulation[] = []
const SIMULATIONS_CAP = 200

const IMPACT_RANGES: Record<GovernanceSimulation["simulationType"], [number, number]> = {
  policy_change: [20, 40],
  constitution_update: [50, 70],
  federation_join: [30, 50],
  new_tenant: [10, 10],
}

function scoreToRecommendation(
  score: number
): GovernanceSimulation["recommendation"] {
  if (score < 30) return "safe"
  if (score < 50) return "caution"
  if (score < 70) return "high_risk"
  return "abort"
}

export function simulateGovernanceChange(
  type: GovernanceSimulation["simulationType"],
  scenario: Record<string, unknown>,
  tenantId?: string
): GovernanceSimulation {
  if (SIMULATIONS.length >= SIMULATIONS_CAP) SIMULATIONS.shift()
  const [min, max] = IMPACT_RANGES[type]
  const predictedImpactScore = min === max ? min : Math.floor(Math.random() * (max - min + 1)) + min
  const simulation: GovernanceSimulation = {
    simulationId: crypto.randomUUID(),
    simulationType: type,
    inputScenario: scenario,
    predictedViolations: Math.floor(predictedImpactScore / 10),
    predictedBlockedWorkflows: Math.floor(predictedImpactScore / 15),
    predictedImpactScore,
    recommendation: scoreToRecommendation(predictedImpactScore),
    simulatedAt: new Date().toISOString(),
    tenantId,
  }
  SIMULATIONS.push(simulation)
  logger.info(`Governance simulation: ${type} → ${simulation.recommendation}`, "governance-simulation", {
    metadata: { simulationId: simulation.simulationId, predictedImpactScore },
  })
  return simulation
}

export function getSimulationHistory(): GovernanceSimulation[] {
  return [...SIMULATIONS]
}

export function getSimulationSummary(): {
  total: number
  byType: Record<string, number>
  byRecommendation: Record<string, number>
} {
  const byType: Record<string, number> = {}
  const byRecommendation: Record<string, number> = {}
  for (const s of SIMULATIONS) {
    byType[s.simulationType] = (byType[s.simulationType] ?? 0) + 1
    byRecommendation[s.recommendation] = (byRecommendation[s.recommendation] ?? 0) + 1
  }
  return { total: SIMULATIONS.length, byType, byRecommendation }
}
