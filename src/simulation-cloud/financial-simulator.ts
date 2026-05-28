import { logger } from "@/runtime-core/observability"

export interface FinancialSimulation {
  simulationId: string
  scenarioType: "outage" | "scaling" | "federation_expansion" | "deployment_failure" | "churn"
  tenantId?: string
  inputParams: Record<string, unknown>
  estimatedRevenueLossUsdCents: number
  estimatedRecoveryCostUsdCents: number
  estimatedNetImpactUsdCents: number
  breakEvenTimeMinutes: number
  recommendation: "acceptable_risk" | "mitigate" | "abort"
  confidenceScore: number
  simulatedAt: string
  runId?: string
}

const SIMULATIONS: FinancialSimulation[] = []
const SIMULATIONS_CAP = 300

function calcImpact(
  scenarioType: FinancialSimulation["scenarioType"],
  params: Record<string, unknown>,
): { revenueLoss: number; recoveryCost: number } {
  const num = (key: string, fallback = 0) => {
    const v = params[key]
    return typeof v === "number" ? v : fallback
  }
  switch (scenarioType) {
    case "outage":
      return { revenueLoss: num("durationMinutes", 1) * 100_00, recoveryCost: 0 }
    case "scaling":
      return { revenueLoss: 0, recoveryCost: num("newCapacity", 1) * 50_00 }
    case "deployment_failure":
      return { revenueLoss: 500_00, recoveryCost: 200_00 }
    case "churn":
      return { revenueLoss: num("churningTenants", 1) * 10000_00, recoveryCost: 0 }
    default:
      return { revenueLoss: 0, recoveryCost: 0 }
  }
}

function recommendation(netImpact: number): FinancialSimulation["recommendation"] {
  if (netImpact < 100_000) return "acceptable_risk"
  if (netImpact < 500_000) return "mitigate"
  return "abort"
}

export function simulateFinancialImpact(
  scenarioType: FinancialSimulation["scenarioType"],
  params: Record<string, unknown>,
  tenantId?: string,
  runId?: string,
): FinancialSimulation {
  if (SIMULATIONS.length >= SIMULATIONS_CAP) SIMULATIONS.shift()

  const { revenueLoss, recoveryCost } = calcImpact(scenarioType, params)
  const netImpact = revenueLoss + recoveryCost
  const breakEvenTimeMinutes = netImpact > 0 ? Math.ceil(netImpact / 1000) : 0

  const sim: FinancialSimulation = {
    simulationId: crypto.randomUUID(),
    scenarioType,
    tenantId,
    inputParams: params,
    estimatedRevenueLossUsdCents: revenueLoss,
    estimatedRecoveryCostUsdCents: recoveryCost,
    estimatedNetImpactUsdCents: netImpact,
    breakEvenTimeMinutes,
    recommendation: recommendation(netImpact),
    confidenceScore: 0.75 + Math.random() * 0.2,
    simulatedAt: new Date().toISOString(),
    runId,
  }
  SIMULATIONS.push(sim)
  logger.info("Financial impact simulated", "financial-simulator", {
    metadata: { simulationId: sim.simulationId, scenarioType, netImpact },
  })
  return sim
}

export function getWorstCaseSimulation(): FinancialSimulation | undefined {
  if (SIMULATIONS.length === 0) return undefined
  return SIMULATIONS.reduce((w, s) =>
    s.estimatedNetImpactUsdCents > w.estimatedNetImpactUsdCents ? s : w,
  )
}

export function getFinancialSummary(): {
  total: number
  totalEstimatedLossUsdCents: number
  byScenario: Record<string, number>
} {
  const byScenario: Record<string, number> = {}
  let totalLoss = 0
  for (const s of SIMULATIONS) {
    byScenario[s.scenarioType] = (byScenario[s.scenarioType] ?? 0) + 1
    totalLoss += s.estimatedNetImpactUsdCents
  }
  return { total: SIMULATIONS.length, totalEstimatedLossUsdCents: totalLoss, byScenario }
}
