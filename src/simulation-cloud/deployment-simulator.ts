import { logger } from "@/runtime-core/observability"

export interface DeploymentSimulation {
  simulationId: string
  deploymentPlanId?: string
  tenantId?: string
  strategy: "rolling" | "canary" | "blue_green" | "shadow"
  predictedSuccessRate: number
  predictedRollbackRate: number
  estimatedDeploymentMinutes: number
  stageResults: {
    stageName: string
    targetPct: number
    predictedErrorRate: number
    riskLevel: "low" | "medium" | "high"
  }[]
  overallRisk: "low" | "medium" | "high" | "critical"
  recommendation: string
  simulatedAt: string
  runId?: string
}

const SIMULATIONS: DeploymentSimulation[] = []
const SIMULATIONS_CAP = 300

const STRATEGY_PROFILES: Record<
  DeploymentSimulation["strategy"],
  { successRate: number; risk: DeploymentSimulation["overallRisk"] }
> = {
  canary:     { successRate: 95, risk: "low" },
  rolling:    { successRate: 88, risk: "medium" },
  blue_green: { successRate: 92, risk: "medium" },
  shadow:     { successRate: 98, risk: "low" },
}

function rollbackRateForSuccess(successRate: number): number {
  return Math.max(0, 100 - successRate)
}

function overallRiskFromRollback(rollbackRate: number): DeploymentSimulation["overallRisk"] {
  if (rollbackRate < 5) return "low"
  if (rollbackRate < 15) return "medium"
  if (rollbackRate < 30) return "high"
  return "critical"
}

export function simulateDeployment(
  strategy: DeploymentSimulation["strategy"],
  stageTargets: number[],
  deploymentPlanId?: string,
  tenantId?: string,
  runId?: string,
): DeploymentSimulation {
  if (SIMULATIONS.length >= SIMULATIONS_CAP) SIMULATIONS.shift()

  const profile = STRATEGY_PROFILES[strategy]
  const predictedSuccessRate = profile.successRate
  const predictedRollbackRate = rollbackRateForSuccess(predictedSuccessRate)
  const overallRisk = overallRiskFromRollback(predictedRollbackRate)

  const stageResults = stageTargets.map((targetPct, i) => {
    const predictedErrorRate = (100 - predictedSuccessRate) * (targetPct / 100)
    const riskLevel: "low" | "medium" | "high" =
      predictedErrorRate < 2 ? "low" : predictedErrorRate < 8 ? "medium" : "high"
    return { stageName: `stage_${i + 1}`, targetPct, predictedErrorRate, riskLevel }
  })

  const estimatedDeploymentMinutes = stageTargets.length * 5 + (strategy === "blue_green" ? 10 : 0)

  const sim: DeploymentSimulation = {
    simulationId: crypto.randomUUID(),
    deploymentPlanId,
    tenantId,
    strategy,
    predictedSuccessRate,
    predictedRollbackRate,
    estimatedDeploymentMinutes,
    stageResults,
    overallRisk,
    recommendation: overallRisk === "low" ? "Proceed" : overallRisk === "medium" ? "Proceed with monitoring" : "Mitigate before deploying",
    simulatedAt: new Date().toISOString(),
    runId,
  }
  SIMULATIONS.push(sim)
  logger.info("Deployment simulated", "deployment-simulator", {
    metadata: { simulationId: sim.simulationId, strategy, overallRisk },
  })
  return sim
}

export function getLatestSimulation(deploymentPlanId?: string): DeploymentSimulation | undefined {
  const filtered = deploymentPlanId
    ? SIMULATIONS.filter((s) => s.deploymentPlanId === deploymentPlanId)
    : SIMULATIONS
  return filtered[filtered.length - 1]
}

export function getSimulationSummary(): {
  total: number
  byStrategy: Record<string, number>
  avgSuccessRate: number
} {
  const byStrategy: Record<string, number> = {}
  let successSum = 0
  for (const s of SIMULATIONS) {
    byStrategy[s.strategy] = (byStrategy[s.strategy] ?? 0) + 1
    successSum += s.predictedSuccessRate
  }
  const total = SIMULATIONS.length
  return { total, byStrategy, avgSuccessRate: total ? successSum / total : 0 }
}
