/**
 * Impact Modeler — models cost and downtime impact of simulation scenarios.
 * In-memory singleton with rolling cap of 100 entries.
 */

import type { ScenarioType } from "./scenario-runner"

const MODELS_CAP = 100

export interface ImpactModel {
  scenarioId: string
  affectedComponents: string[]
  estimatedDowntimeMs: number
  estimatedCostImpactUsd: number
  recoveryTimeEstimateMs: number
  confidenceScore: number
  modeledAt: string
}

const MODELS: ImpactModel[] = []

function enforceCap(): void {
  while (MODELS.length > MODELS_CAP) MODELS.shift()
}

export function modelImpact(
  scenarioId: string,
  params: {
    affectedComponents: string[]
    baselineCostPerMinuteUsd: number
    mttrMs: number
  }
): ImpactModel {
  const { affectedComponents, baselineCostPerMinuteUsd, mttrMs } = params
  const estimatedDowntimeMs = mttrMs * (1 + affectedComponents.length * 0.1)
  const estimatedCostImpactUsd =
    baselineCostPerMinuteUsd * (estimatedDowntimeMs / 60_000)
  const confidenceScore = Math.min(0.9, 0.5 + affectedComponents.length * 0.05)

  const model: ImpactModel = {
    scenarioId,
    affectedComponents,
    estimatedDowntimeMs,
    estimatedCostImpactUsd,
    recoveryTimeEstimateMs: mttrMs,
    confidenceScore,
    modeledAt: new Date().toISOString(),
  }
  MODELS.push(model)
  enforceCap()
  return model
}

export function getImpactModel(scenarioId: string): ImpactModel | undefined {
  return MODELS.find((m) => m.scenarioId === scenarioId)
}

export function getWorstCaseScenarios(limit = 10): ImpactModel[] {
  return [...MODELS].sort((a, b) => b.estimatedCostImpactUsd - a.estimatedCostImpactUsd).slice(0, limit)
}

// Re-export ScenarioType for consumers that only import from impact-modeler
export type { ScenarioType }
